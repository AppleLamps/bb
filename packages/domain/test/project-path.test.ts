import { describe, expect, it } from "vitest";
import {
  deriveProjectNameFromPath,
  getProjectPathValidationMessage,
  INVALID_PROJECT_PATH_MESSAGE,
  isAbsoluteProjectPath,
  isNativeWindowsProjectPath,
  normalizeProjectPathInput,
  PROJECT_PATH_ROOT_MESSAGE,
} from "../src/project-path.js";

describe("project-path", () => {
  const windowsProjectPath = "C:\\Users\\michael\\bb";
  const windowsRootPath = "C:\\";
  const uncProjectPath = "\\\\server\\share\\bb";

  it("derives a project name from POSIX paths", () => {
    expect(deriveProjectNameFromPath("/srv/repos/bb")).toBe("bb");
    expect(deriveProjectNameFromPath("/srv/repos/bb/")).toBe("bb");
    expect(deriveProjectNameFromPath("/mnt/c/Users/michael/bb/")).toBe("bb");
  });

  it("derives a project name from native Windows paths", () => {
    expect(deriveProjectNameFromPath(windowsProjectPath)).toBe("bb");
    expect(deriveProjectNameFromPath("C:/Users/michael/bb/")).toBe("bb");
    expect(deriveProjectNameFromPath(uncProjectPath)).toBe("bb");
    expect(deriveProjectNameFromPath("\\\\?\\C:\\Users\\michael\\bb")).toBe(
      "bb",
    );
  });

  it("does not derive a project name from filesystem roots", () => {
    expect(deriveProjectNameFromPath("/")).toBe("");
    expect(deriveProjectNameFromPath(windowsRootPath)).toBe("");
    expect(deriveProjectNameFromPath("\\\\server\\share")).toBe("");
  });

  it("recognizes supported absolute paths", () => {
    expect(isAbsoluteProjectPath("/srv/repos/bb")).toBe(true);
    expect(isAbsoluteProjectPath("/mnt/c/Users/michael/bb")).toBe(true);
    expect(isAbsoluteProjectPath(windowsProjectPath)).toBe(true);
    expect(isAbsoluteProjectPath(uncProjectPath)).toBe(true);
    // Drive-relative: `C:Users` resolves against the drive's current directory,
    // which is process state we cannot reproduce on the host.
    expect(isAbsoluteProjectPath("C:Users\\michael\\bb")).toBe(false);
    expect(isAbsoluteProjectPath("relative/path")).toBe(false);
  });

  it("recognizes native Windows path style", () => {
    expect(isNativeWindowsProjectPath(windowsProjectPath)).toBe(true);
    expect(isNativeWindowsProjectPath("C:/Users/michael/bb")).toBe(true);
    expect(isNativeWindowsProjectPath(uncProjectPath)).toBe(true);
    expect(isNativeWindowsProjectPath(windowsRootPath)).toBe(true);
    expect(isNativeWindowsProjectPath("/mnt/c/Users/michael/bb")).toBe(false);
  });

  it("normalizes trailing separators without collapsing filesystem roots", () => {
    expect(normalizeProjectPathInput("/srv/repos/bb/")).toBe("/srv/repos/bb");
    expect(normalizeProjectPathInput("/mnt/c/Users/michael/bb/")).toBe(
      "/mnt/c/Users/michael/bb",
    );
    expect(normalizeProjectPathInput("/")).toBe("/");
    expect(normalizeProjectPathInput(`${windowsProjectPath}\\`)).toBe(
      windowsProjectPath,
    );
    expect(normalizeProjectPathInput("c:/Users/michael/bb/")).toBe(
      windowsProjectPath,
    );
    expect(normalizeProjectPathInput("C:")).toBe(windowsRootPath);
    expect(normalizeProjectPathInput("\\\\?\\C:\\Users\\michael\\bb")).toBe(
      windowsProjectPath,
    );
    expect(normalizeProjectPathInput("\\\\?\\UNC\\server\\share\\bb")).toBe(
      uncProjectPath,
    );
    expect(normalizeProjectPathInput(`${uncProjectPath}\\`)).toBe(
      uncProjectPath,
    );
  });

  it("returns clear validation messages for unsupported path formats", () => {
    expect(getProjectPathValidationMessage("/srv/repos/bb")).toBeNull();
    expect(
      getProjectPathValidationMessage("/mnt/c/Users/michael/bb"),
    ).toBeNull();
    expect(getProjectPathValidationMessage(windowsProjectPath)).toBeNull();
    expect(getProjectPathValidationMessage(uncProjectPath)).toBeNull();
    expect(getProjectPathValidationMessage("/")).toBe(
      PROJECT_PATH_ROOT_MESSAGE,
    );
    expect(getProjectPathValidationMessage(windowsRootPath)).toBe(
      PROJECT_PATH_ROOT_MESSAGE,
    );
    expect(getProjectPathValidationMessage("\\\\server\\share")).toBe(
      PROJECT_PATH_ROOT_MESSAGE,
    );
    expect(getProjectPathValidationMessage("relative/path")).toBe(
      INVALID_PROJECT_PATH_MESSAGE,
    );
    expect(getProjectPathValidationMessage("C:Users\\michael\\bb")).toBe(
      INVALID_PROJECT_PATH_MESSAGE,
    );
  });
});
