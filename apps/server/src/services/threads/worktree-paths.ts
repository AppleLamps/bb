import path from "node:path";
import {
  getAbsolutePathBasename,
  isWindowsAbsolutePath,
  joinAbsolutePlatformPath,
} from "@bb/domain";
import { ApiError } from "../../errors.js";

const REPO_DIR_NAME_PATTERN = /^[A-Za-z0-9._][A-Za-z0-9._-]*$/;

export function deriveRepoDirName(sourcePath: string): string {
  const trimmed = sourcePath.replace(/\/+$/, "");

  // A native Windows source path is not a URL and not scp syntax, and its
  // drive letter would otherwise read as an scp host separator.
  if (isWindowsAbsolutePath(trimmed)) {
    return assertRepoDirNameCandidate(
      sourcePath,
      stripGitSuffix(getAbsolutePathBasename(trimmed)),
    );
  }

  const scpMatch = /^[^:/]+@[^:]+:(?<path>.+)$/.exec(trimmed);
  const pathPart =
    scpMatch?.groups?.path ?? tryParseUrlPath(trimmed) ?? trimmed;

  const basename = path.posix.basename(pathPart);
  return assertRepoDirNameCandidate(sourcePath, stripGitSuffix(basename));
}

function stripGitSuffix(basename: string): string {
  return basename.endsWith(".git")
    ? basename.slice(0, -".git".length)
    : basename;
}

function assertRepoDirNameCandidate(
  sourcePath: string,
  candidate: string,
): string {
  if (
    !candidate ||
    candidate === "." ||
    candidate === ".." ||
    !REPO_DIR_NAME_PATTERN.test(candidate)
  ) {
    throw new ApiError(
      400,
      "invalid_request",
      `Cannot derive repository directory name from source "${sourcePath}"`,
    );
  }
  return candidate;
}

function tryParseUrlPath(value: string): string | null {
  try {
    const url = new URL(value);
    if (
      url.protocol === "http:" ||
      url.protocol === "https:" ||
      url.protocol === "ssh:"
    ) {
      return url.pathname;
    }
  } catch {
    // not a URL
  }
  return null;
}

export interface ResolveManagedTargetPathArgs {
  dataDir: string;
  environmentId: string;
  sourcePath: string;
}

export interface ResolvePersonalTargetPathArgs {
  dataDir: string;
  environmentId: string;
}

export function resolveManagedTargetPath(
  args: ResolveManagedTargetPathArgs,
): string {
  return joinAbsolutePlatformPath(
    args.dataDir,
    "worktrees",
    args.environmentId,
    deriveRepoDirName(args.sourcePath),
  );
}

export function resolvePersonalTargetPath(
  args: ResolvePersonalTargetPathArgs,
): string {
  return joinAbsolutePlatformPath(
    args.dataDir,
    "personal-workspaces",
    args.environmentId,
  );
}
