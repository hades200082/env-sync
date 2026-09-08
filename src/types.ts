/** Shells envsync knows how to drive. */
export type ShellName = "bash" | "sh" | "zsh" | "pwsh" | "powershell" | "cmd";

export const SHELL_NAMES: readonly ShellName[] = ["bash", "sh", "zsh", "pwsh", "powershell", "cmd"];

export type OsFamily = "linux" | "macos" | "windows";

/**
 * Command text. A string runs as-is. An array is one step per line and stops
 * at the first step that fails.
 */
export type CommandText = string | string[];

/** A command with an optional shell override. */
export interface CommandObject {
  run: CommandText;
  shell?: ShellName;
}

/**
 * One command value. `null` means "nothing to do on this platform" and is
 * treated as a deliberate skip rather than a missing definition.
 */
export type CommandValue = CommandText | CommandObject | null;

/** A command keyed by platform selector (`ubuntu`, `apt`, `macos`, `default`...). */
export type PlatformMap = Record<string, CommandValue>;

export type Command = CommandValue | PlatformMap;

export interface ToolSpec {
  name: string;
  description?: string;
  /**
   * Exit 0 = installed. A bare word with no whitespace is looked up on PATH
   * instead of being executed.
   */
  check?: Command;
  install?: Command;
  update?: Command;
  /** Only run on machines matching at least one of these selectors. */
  platforms?: string[];
}

export interface Config {
  $schema?: string;
  /** Default shell per OS family. */
  shell?: Partial<Record<OsFamily, ShellName>>;
  tools: ToolSpec[];
}

export interface Platform {
  os: OsFamily;
  /** Distro id on Linux (`ubuntu`, `linuxmint`, `fedora`), else `macos` / `windows`. */
  id: string;
  /** `24.04`, `22.1`, `15.2`, `11`... Empty when unknown. */
  version: string;
  /** ID_LIKE on Linux, e.g. Mint gives `["ubuntu", "debian"]`. */
  like: string[];
  packageManagers: string[];
  arch: string;
  wsl: boolean;
  /**
   * Where the run is happening, beyond the OS: `claude-code`, `codex`,
   * `codespaces`, `gitpod`, `ci`, `container`, `wsl`. Empty on a plain machine.
   */
  environment: string[];
  /** stdin and stdout are both terminals. */
  interactive: boolean;
  /** Running as uid 0 (never true on Windows). */
  root: boolean;
  /** `sudo` when a privilege prefix is needed and available, else empty. */
  sudo: string;
  /** TERM_PROGRAM, `windows-terminal`, or empty. */
  terminal: string;
  /** Ordered most specific first. The first key found in a platform map wins. */
  selectors: string[];
}

export interface ResolvedCommand {
  run: string;
  /** True when the config gave an array of steps. */
  failFast: boolean;
  shell: ShellName | undefined;
  /** Which selector matched, or `direct` when the command was a plain value. */
  selector: string;
}
