import {
  getAbsolutePathBasename,
  isAbsolutePlatformPath,
  isFilesystemRootPath,
  isWindowsAbsolutePath,
  normalizeAbsolutePlatformPath,
} from "./platform-path.js";

export const INVALID_PROJECT_PATH_MESSAGE =
  "Project path must be an absolute path.";
export const PROJECT_PATH_ROOT_MESSAGE =
  "Project path must point to a project directory, not the filesystem root.";

/**
 * Native Windows drive-letter and UNC paths are supported product input. The
 * export stays so callers can branch on path style (for example when choosing
 * separators for display), not to reject anything.
 */
export function isNativeWindowsProjectPath(path: string): boolean {
  return isWindowsAbsolutePath(path);
}

export function isAbsoluteProjectPath(path: string): boolean {
  return isAbsolutePlatformPath(path);
}

export function normalizeProjectPathInput(path: string): string {
  return normalizeAbsolutePlatformPath(path);
}

export function getProjectPathValidationMessage(path: string): string | null {
  const normalizedPath = normalizeProjectPathInput(path);
  if (!normalizedPath) {
    return INVALID_PROJECT_PATH_MESSAGE;
  }
  if (!isAbsoluteProjectPath(normalizedPath)) {
    return INVALID_PROJECT_PATH_MESSAGE;
  }
  if (isFilesystemRootPath(normalizedPath)) {
    return PROJECT_PATH_ROOT_MESSAGE;
  }
  return null;
}

export function deriveProjectNameFromPath(path: string): string {
  const normalizedPath = normalizeProjectPathInput(path);
  if (!normalizedPath || !isAbsoluteProjectPath(normalizedPath)) {
    return "";
  }
  return getAbsolutePathBasename(normalizedPath);
}
