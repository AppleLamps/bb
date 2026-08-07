import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const defaultRepoRoot = resolve(fileURLToPath(import.meta.url), "../..");

/**
 * Each add-on declares how to exercise its native binding, in two forms:
 * `verify` for the in-process check and `verifySource` for the fresh-process
 * recheck (where `requireModule` is in scope). They must stay equivalent.
 */
export const nativeModules = [
  {
    name: "better-sqlite3",
    resolveFrom: "packages/db/package.json",
    // better-sqlite3 loads its binding lazily inside the constructor, so
    // requiring the wrapper alone cannot surface an ABI mismatch.
    verify: (requireModule) => {
      const Database = requireModule("better-sqlite3");
      const db = new Database(":memory:");
      db.close();
    },
    verifySource: `const Database = requireModule("better-sqlite3");
const db = new Database(":memory:");
db.close();`,
  },
  {
    name: "@parcel/watcher",
    resolveFrom: "packages/host-watcher/package.json",
    // @parcel/watcher loads its binding at module scope via node-gyp-build, so
    // the require itself is what fails on an ABI or platform mismatch.
    verify: (requireModule) => {
      requireModule("@parcel/watcher");
    },
    verifySource: `requireModule("@parcel/watcher");`,
  },
];

function getNativeModuleEntry(name) {
  const entry = nativeModules.find((module) => module.name === name);
  if (entry === undefined) {
    throw new Error(`Unknown native module: ${name}`);
  }
  return entry;
}

function formatThrownValue(err) {
  return err instanceof Error ? err.message : String(err);
}

function formatChildProcessFailure(err) {
  const details = [formatThrownValue(err).split("\n")[0]];
  if (err && typeof err === "object") {
    if ("status" in err && err.status !== null && err.status !== undefined) {
      details.push(`exit status: ${String(err.status)}`);
    }
    if ("signal" in err && err.signal !== null && err.signal !== undefined) {
      details.push(`signal: ${String(err.signal)}`);
    }

    for (const streamName of ["stdout", "stderr"]) {
      const output = err[streamName];
      if (output === undefined || output === null) continue;

      const text = Buffer.isBuffer(output)
        ? output.toString("utf8")
        : String(output);
      const trimmed = text.trim();
      if (trimmed.length > 0) {
        details.push(`${streamName}: ${trimmed}`);
      }
    }
  }

  return details.join("\n");
}

export function verifyNativeModule(name, requireModule, verify) {
  (verify ?? getNativeModuleEntry(name).verify)(requireModule);
}

function shouldRebuildNativeModule(errorMessage) {
  return (
    /NODE_MODULE_VERSION|Could not locate the bindings file|Module did not self-register/.test(
      errorMessage,
    )
  );
}

function getRepairableNativeModuleError(name, requireModule) {
  try {
    verifyNativeModule(name, requireModule);
    return null;
  } catch (err) {
    const message = formatThrownValue(err);
    if (!shouldRebuildNativeModule(message)) throw err;
    return message;
  }
}

function getRepairedNativeModuleError(name, pkgJsonPath, verifySource) {
  const source = verifySource ?? getNativeModuleEntry(name).verifySource;
  try {
    // A failed dlopen remains cached for the life of the process. Verify a
    // replacement binary in a fresh process so the old handle cannot poison it.
    execFileSync(
      process.execPath,
      [
        "--input-type=module",
        "--eval",
        `import { createRequire } from "node:module";
const requireModule = createRequire(${JSON.stringify(pkgJsonPath)});
const require = requireModule;
${source}`,
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    return null;
  } catch (err) {
    const message = formatChildProcessFailure(err);
    if (!shouldRebuildNativeModule(message)) throw err;
    return message;
  }
}

export function ensureNativeModules({
  repoRoot = defaultRepoRoot,
  modules = nativeModules,
  createRequire: createRequireImpl = createRequire,
  execFileSync: execFileSyncImpl = execFileSync,
  verifyRepairedNativeModule: verifyRepairedNativeModuleImpl =
    getRepairedNativeModuleError,
  log = console.log,
} = {}) {
  for (const { name, resolveFrom, verify, verifySource } of modules) {
    const requireModule = createRequireImpl(resolve(repoRoot, resolveFrom));
    try {
      verifyNativeModule(name, requireModule, verify);
    } catch (err) {
      const message = formatThrownValue(err);
      if (!shouldRebuildNativeModule(message)) throw err;

      const pkgJsonPath = requireModule.resolve(`${name}/package.json`);
      const pkgDir = dirname(pkgJsonPath);
      const pkgRequire = createRequireImpl(pkgJsonPath);
      log(
        `[ensure-native-modules] Installing prebuilt ${name} for Node ${process.versions.node} (ABI ${process.versions.modules})`,
      );
      let prebuildInstalled = false;
      try {
        execFileSyncImpl(
          process.execPath,
          [pkgRequire.resolve("prebuild-install/bin.js")],
          {
            cwd: pkgDir,
            encoding: "utf8",
            env: { ...process.env, npm_config_loglevel: "info" },
            stdio: ["ignore", "pipe", "pipe"],
          },
        );
        prebuildInstalled = true;
      } catch (prebuildErr) {
        const message = formatChildProcessFailure(prebuildErr);
        log(
          `[ensure-native-modules] Prebuilt ${name} unavailable or unusable: ${message}`,
        );
      }

      const prebuildVerifyError = verifyRepairedNativeModuleImpl(
        name,
        pkgJsonPath,
        verifySource,
      );
      if (prebuildVerifyError === null) {
        if (!prebuildInstalled) {
          log(
            `[ensure-native-modules] Prebuilt ${name} loaded despite installer failure`,
          );
        }
        continue;
      }

      if (prebuildInstalled) {
        log(
          `[ensure-native-modules] Prebuilt ${name} failed to load: ${prebuildVerifyError}`,
        );
      } else {
        log(
          `[ensure-native-modules] Prebuilt ${name} still failed to load: ${prebuildVerifyError}`,
        );
      }

      log(
        `[ensure-native-modules] Rebuilding ${name} from source for Node ${process.versions.node} (ABI ${process.versions.modules})`,
      );
      execFileSyncImpl(
        process.execPath,
        [
          pkgRequire.resolve("node-gyp/bin/node-gyp.js"),
          "rebuild",
          "--release",
        ],
        {
          cwd: pkgDir,
          stdio: "inherit",
        },
      );

      const rebuildVerifyError = verifyRepairedNativeModuleImpl(
        name,
        pkgJsonPath,
        verifySource,
      );
      if (rebuildVerifyError !== null) {
        throw new Error(
          `[ensure-native-modules] ${name} still failed to load after rebuild: ${rebuildVerifyError}`,
        );
      }
    }
  }
}

const isMainModule =
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (isMainModule) {
  ensureNativeModules();
}
