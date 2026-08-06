<!-- Diátaxis: reference -->

# Platform Support

## Supported host environments

- macOS persistent host
- Linux persistent host
- Windows persistent host (native win32)
- Windows via Ubuntu on WSL2

Minimum runtime: Node.js 22.19. The floor comes from Pi, whose packages declare
`engines.node: ">=22.19.0"`.

Tested npm package runtimes:

- Node.js 22.19 or newer in the Node.js 22 release line
- Node.js 24 LTS
- Node.js 26 Current

Newer release lines are not blocked. `install-machine.sh` gates on the 22.19
floor only, so a release line we have not tested yet still installs rather than
failing hard on the day it ships. The `bb-app` npm `engines` field lists the
tested lines, which npm surfaces as a warning rather than an install failure.

Windows has two supported shapes. Pick one per machine and stay in it — a
machine enrolled from WSL2 addresses projects by their WSL paths, and one
enrolled natively addresses them by drive-letter paths.

Native Windows runs the stack directly on win32:

- `bb` processes run in PowerShell or CMD; WSL2 is not involved
- drive-letter (`C:\Users\me\repo`), UNC (`\\server\share\repo`), and
  extended-length (`\\?\C:\...`) paths are supported product input
- the data dir is `%USERPROFILE%\.bb`
- the setup hook is `.bb-env-setup.ps1`, with `.bb-env-setup.sh` as a fallback

WSL2 runs the Linux stack entirely inside the distro:

- all `bb` processes run inside the same Ubuntu WSL2 distro
- Node.js, Git, provider CLIs, and pnpm for source-development flows are
  installed inside WSL2
- local project paths use Linux-style absolute paths from inside WSL2

## Support Boundaries

### Supported product flows

- `npx bb-app`
- `npx --package bb-app bb ...`
- source checkout package startup with `pnpm start`
- source checkout validation with `pnpm install`, `pnpm build`,
  `pnpm exec turbo run typecheck`, and `pnpm exec turbo run test`
- app + server + host-daemon startup on supported persistent-host OSes
- local-path project creation and update in the app
- unmanaged environments
- managed worktree environments
- provider runtime startup where the provider itself supports the host
  environment
- `npx bb-app` package startup on supported npm package runtimes
- `npx --package bb-app bb ...` CLI execution through the published package

### Command ownership and mode selection

- `@bb/config` is the only source of dev/prod defaults.
- Repo-root source-development commands such as `pnpm start`, `pnpm bb`,
  `pnpm bb:dev`, and `pnpm reset` are thin wrappers around local packages and
  scripts.
- Those wrappers set `NODE_ENV` explicitly so ambient shell state does not
  change which bb instance they target.
- Explicit `BB_*` values override the `NODE_ENV`-selected defaults.
- Process-to-process handoff, such as daemon-injected CLI environment, must use
  explicit `BB_*` values for the exact target instance instead of relying on
  mode defaults.

### WSL2-specific expectations

- Run `npx bb-app`, source checkout commands such as `pnpm install`,
  `pnpm dev`, `pnpm bb:dev`, and host-daemon commands from a WSL2 shell, not
  from native Windows terminals.
- Repositories inside the WSL filesystem are recommended for best behavior.
- `/mnt/c/...` mounted paths are deliberately supported so WSL2 users can keep
  working with existing Windows checkouts instead of relocating every repo into
  the WSL filesystem, but they are a tradeoff:
  slower filesystem I/O and weaker file-watching behavior than the WSL
  filesystem.

### Native-Windows-specific expectations

- Paths are normalized to one canonical form at the app/server boundary:
  uppercase drive letter, backslash separators, no trailing separator, and no
  `\\?\` extended-length prefix. `C:\repo`, `c:/repo/`, and `\\?\C:\repo` all
  store as `C:\repo`.
- Drive-relative paths such as `C:Users\me\repo` are rejected. They resolve
  against the drive's per-process current directory, which the host cannot
  reproduce.
- Terminals run through node-pty's ConPTY backend. The shell is
  `BB_TERMINAL_SHELL`, then `COMSPEC`, then PowerShell, then `cmd.exe`.
- The "open in terminal" workspace target is unavailable: its opener passes the
  shell a POSIX script. "Open in file manager" and "default app" use
  `explorer.exe`.
- Provider runtimes are supported only where the provider itself supports
  native Windows.

### Maintainer-only or best-effort surfaces

- workspace-owned QA helpers under [`tests/qa/`](../tests/qa/)
- dev restart internals that are not part of the shipped product path
- source-checkout development flows on native Windows (`pnpm dev`,
  `scripts/bb-dev-app`); the packaged `npx bb-app` path is the supported one

## Dependency Policy

We are standardizing on a small set of cross-platform packages:

- `cross-env`
  - portable environment injection in package scripts
- `rimraf`
  - portable recursive cleanup in package scripts
- `cross-spawn`
  - shared subprocess launch for portability-sensitive runtime paths
- `open`
  - OS-specific file/URL opening behind a repo-local helper

We are explicitly not adopting:

- `shx`
  - we prefer small Node scripts for copy/create-directory logic
- generic path helper libraries
  - `node:path` is sufficient
- generic filesystem helper libraries
  - `fs/promises` is sufficient

### Native npm dependencies

The npm package keeps native add-ons as runtime dependencies instead of bundling
one platform-specific `.node` binary into bb's JavaScript artifacts. This lets
npm install the correct native artifacts on the target machine for packages such
as `better-sqlite3` and `@parcel/watcher`. Both ship win32-x64 and win32-arm64
prebuilds for the tested Node lines.

`node scripts/ensure-native-modules.mjs` checks each native add-on by loading it
in a fresh process, reinstalls its prebuild when the load fails for an ABI or
bindings reason, and rebuilds from source with node-gyp when no usable prebuild
exists. It runs automatically from `pnpm dev` and can be run directly.

Known failure modes remain the normal native-addon ones:

- changing Node versions after install without reinstalling or rebuilding
- copying `node_modules` across operating systems, CPU architectures, or libc
  variants
- disabling package lifecycle scripts
- running on a platform where no prebuild exists and no local build toolchain is
  available

The recovery path after a Node/runtime change is to reinstall the package or
rebuild the native dependency, for example `npm rebuild better-sqlite3`.

## Setup Hook Policy

- The supported setup hook is POSIX `.bb-env-setup.sh` on macOS, Linux, and
  WSL2, and `.bb-env-setup.ps1` on native Windows.
- Native Windows prefers `.bb-env-setup.ps1` and falls back to
  `.bb-env-setup.sh` through `bash` when a repo ships only that one. A repo
  targeting both can commit both files.
- The hook runs with cwd set to the new workspace. PowerShell hooks run as
  `powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File`.
- No parallel `.bb-env-setup.ts` product-path mechanism is supported.
- The `.worktreeinclude` copy step runs no shell. It works on every platform,
  including native Windows.

## Line Ending Policy

- The repository enforces LF checkout for supported text files via
  [.gitattributes](../.gitattributes).
- Supported Linux and WSL2 flows must work with those repository rules applied.
- Native Windows product flows run from the published npm package, which is not
  affected by repository checkout line endings. Source checkouts on native
  Windows should set `core.autocrlf=false` so the LF rules survive.

## CI And Validation

- GitHub Actions uses Ubuntu as the required support gate for build,
  typecheck, lint, test, and Linux smoke coverage.
- Full build, typecheck, lint, and test checks run on Ubuntu with Node.js 22
  only.
- Pull requests run the `bb-app` tarball smoke on Ubuntu and macOS with Node.js
  22, validating the packed npm artifact through `npx --package`.
- Pushes to `main` and manually dispatched CI runs also run the `bb-app` tarball
  smoke on Ubuntu and macOS with Node.js 24 and 26.
- Pull requests run `Windows Smoke (windows-latest, Node 22.x)`: native-module
  load, full typecheck, the platform-agnostic test packages, and the `bb-app`
  tarball smoke, which starts the server plus host daemon and health-checks
  both.
- Branch protection should require `Checks (ubuntu-latest, Node 22.x)`,
  `Package Smoke (ubuntu-latest, Node 22.x)`, and
  `Package Smoke (macos-latest, Node 22.x)`. The Node.js 24 and 26 compatibility
  smoke jobs do not run on pull requests and should not be configured as
  required PR checks.
- Windows smoke is deliberately not a required check yet. It is coverage for
  native-module and path regressions, not the full Linux matrix; the server,
  app, and integration suites still assume a POSIX host in places.
