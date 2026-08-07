/**
 * Isomorphic absolute-path helpers shared by the app, server, and host daemon.
 *
 * This module deliberately does not import `node:path`. It runs in the browser
 * bundle, and the host that owns a path is not always the host doing the
 * parsing: a macOS server can validate a path for a Windows machine and the
 * browser UI has no platform at all. So the rules here are style-directed
 * (POSIX vs Windows) rather than `process.platform`-directed. Code that touches
 * the local filesystem should keep using `node:path`, which already resolves
 * against the running platform.
 */

export type AbsolutePathStyle = "posix" | "windows";

/** `C:\repo`, `c:/repo` — a drive-letter path with a root separator. */
const WINDOWS_DRIVE_ABSOLUTE_PATTERN = /^[A-Za-z]:[\\/]/u;
/** `C:`, `C:\`, `C:/` — the drive root itself, with or without a separator. */
const WINDOWS_DRIVE_ROOT_PATTERN = /^[A-Za-z]:[\\/]*$/u;
/**
 * `\\server\share\repo`. Backslashes only: POSIX treats `//server/share` as an
 * ordinary absolute path, so matching forward slashes here would misread it.
 */
const WINDOWS_UNC_PATTERN = /^\\\\[^\\/]+\\+[^\\/]+/u;
/** `\\?\C:\repo` and `\\?\UNC\server\share` extended-length prefixes. */
const WINDOWS_EXTENDED_PREFIX_PATTERN = /^\\\\\?\\/u;
const WINDOWS_EXTENDED_UNC_PREFIX_PATTERN = /^\\\\\?\\UNC\\/iu;

/**
 * Removes the `\\?\` extended-length escape. The prefix is a Win32 API opt-out
 * of `MAX_PATH`, not part of the path's identity, so two records for the same
 * directory must not differ by it.
 */
function stripWindowsExtendedPrefix(path: string): string {
  if (WINDOWS_EXTENDED_UNC_PREFIX_PATTERN.test(path)) {
    return `\\\\${path.slice("\\\\?\\UNC\\".length)}`;
  }
  if (WINDOWS_EXTENDED_PREFIX_PATTERN.test(path)) {
    return path.slice("\\\\?\\".length);
  }
  return path;
}

export function isWindowsAbsolutePath(path: string): boolean {
  const candidate = stripWindowsExtendedPrefix(path.trim());
  if (!candidate) {
    return false;
  }
  return (
    WINDOWS_DRIVE_ABSOLUTE_PATTERN.test(candidate) ||
    WINDOWS_DRIVE_ROOT_PATTERN.test(candidate) ||
    WINDOWS_UNC_PATTERN.test(candidate)
  );
}

export function isPosixAbsolutePath(path: string): boolean {
  return path.trim().startsWith("/");
}

export function isAbsolutePlatformPath(path: string): boolean {
  return isPosixAbsolutePath(path) || isWindowsAbsolutePath(path);
}

export function getAbsolutePathStyle(path: string): AbsolutePathStyle | null {
  if (isWindowsAbsolutePath(path)) {
    return "windows";
  }
  if (isPosixAbsolutePath(path)) {
    return "posix";
  }
  return null;
}

function normalizeWindowsAbsolutePath(path: string): string {
  const withoutPrefix = stripWindowsExtendedPrefix(path.trim());
  const isUnc = WINDOWS_UNC_PATTERN.test(withoutPrefix);
  const backslashed = withoutPrefix.replace(/\//gu, "\\");
  // Collapse repeated separators, then restore the UNC `\\` root.
  const collapsed = backslashed.replace(/\\{2,}/gu, "\\");
  const rooted = isUnc ? `\\${collapsed}` : collapsed;

  if (WINDOWS_DRIVE_ROOT_PATTERN.test(rooted)) {
    return `${rooted.charAt(0).toUpperCase()}:\\`;
  }

  const withUppercaseDrive = WINDOWS_DRIVE_ABSOLUTE_PATTERN.test(rooted)
    ? `${rooted.charAt(0).toUpperCase()}${rooted.slice(1)}`
    : rooted;
  const trimmed = withUppercaseDrive.replace(/\\+$/u, "");
  // `C:` alone is drive-relative on Windows, so a trailing-separator strip that
  // reaches the drive must leave the root separator in place.
  return WINDOWS_DRIVE_ROOT_PATTERN.test(trimmed)
    ? `${trimmed.charAt(0).toUpperCase()}:\\`
    : trimmed;
}

/**
 * Canonical storage form for an absolute path. POSIX paths keep forward
 * slashes; Windows paths are stored drive-uppercased with backslashes and no
 * trailing separator, so the same directory always produces the same string.
 * Non-absolute input is returned trimmed and otherwise untouched.
 */
export function normalizeAbsolutePlatformPath(path: string): string {
  const trimmed = path.trim();
  if (!trimmed) {
    return "";
  }
  if (isWindowsAbsolutePath(trimmed)) {
    return normalizeWindowsAbsolutePath(trimmed);
  }
  if (trimmed === "/") {
    return trimmed;
  }
  return trimmed.replace(/\/+$/u, "");
}

/**
 * Display/URL form. Windows separators become `/` so the same helper can build
 * links, mention targets, and log lines on every platform.
 */
export function toPosixPathSeparators(path: string): string {
  return stripWindowsExtendedPrefix(path.trim()).replace(/\\/gu, "/");
}

/** True for `/`, `C:\`, and `\\server\share` — a path with nothing above it. */
export function isFilesystemRootPath(path: string): boolean {
  const normalized = normalizeAbsolutePlatformPath(path);
  if (!normalized) {
    return false;
  }
  if (normalized === "/") {
    return true;
  }
  if (WINDOWS_DRIVE_ROOT_PATTERN.test(normalized)) {
    return true;
  }
  // A bare `\\server\share` has no parent directory to own a project.
  return /^\\\\[^\\]+\\[^\\]+$/u.test(normalized);
}

/**
 * Joins segments onto an absolute base using the base's own separator style.
 * The server builds paths for a host it is not running on, so it must follow
 * the base path rather than `node:path`'s idea of the local platform.
 */
export function joinAbsolutePlatformPath(
  basePath: string,
  ...segments: string[]
): string {
  const normalizedBase = normalizeAbsolutePlatformPath(basePath);
  const separator = isWindowsAbsolutePath(normalizedBase) ? "\\" : "/";
  const cleanedSegments = segments
    .flatMap((segment) => segment.split(/[\\/]+/u))
    .filter((segment) => segment.length > 0);
  if (cleanedSegments.length === 0) {
    return normalizedBase;
  }
  const base = normalizedBase.endsWith(separator)
    ? normalizedBase.slice(0, -separator.length)
    : normalizedBase;
  return `${base}${separator}${cleanedSegments.join(separator)}`;
}

/** Last path segment of an absolute path, or `""` for a filesystem root. */
export function getAbsolutePathBasename(path: string): string {
  const normalized = normalizeAbsolutePlatformPath(path);
  if (!normalized || isFilesystemRootPath(normalized)) {
    return "";
  }
  const segments = toPosixPathSeparators(normalized)
    .split("/")
    .filter((segment) => segment.length > 0 && !segment.endsWith(":"));
  return segments.at(-1) ?? "";
}
