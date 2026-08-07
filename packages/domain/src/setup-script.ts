export const DEFAULT_ENV_SETUP_SCRIPT_NAME = ".bb-env-setup.sh";

/**
 * Native Windows setup hook. PowerShell is the shell that ships with every
 * supported Windows host, so it plays the role `bash` plays on POSIX rather
 * than requiring Git Bash or WSL to be on PATH.
 */
export const WINDOWS_ENV_SETUP_SCRIPT_NAME = ".bb-env-setup.ps1";

/**
 * Setup hook file names for a host platform, in the order the host should look
 * for them. Windows accepts the POSIX hook as a fallback so a repo that only
 * ships `.bb-env-setup.sh` still provisions when `bash` is on PATH (Git for
 * Windows installs one).
 */
export function envSetupScriptNamesForPlatform(
  platform: string,
): readonly string[] {
  return platform === "win32"
    ? [WINDOWS_ENV_SETUP_SCRIPT_NAME, DEFAULT_ENV_SETUP_SCRIPT_NAME]
    : [DEFAULT_ENV_SETUP_SCRIPT_NAME];
}

/**
 * Gitignore-style pattern file. It names untracked files that a new worktree
 * must receive from the source checkout, such as `.env`.
 */
export const WORKTREE_INCLUDE_FILE_NAME = ".worktreeinclude";
