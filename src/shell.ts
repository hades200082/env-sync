import { spawn } from "node:child_process";
import { findOnPath } from "./which.js";
import type { OsFamily, Platform, ShellName } from "./types.js";

export interface RunOptions {
  /** Capture stdout/stderr instead of streaming to the terminal. */
  capture?: boolean;
  /** Stop at the first failing line (array-of-steps form). */
  failFast?: boolean;
  /** Put the command in its own process group/session. */
  isolateProcessGroup?: boolean;
  env?: NodeJS.ProcessEnv;
  cwd?: string;
  timeoutMs?: number;
}

export interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

export interface ShellInvocation {
  file: string;
  args: string[];
}

/** Pick the shell to use when neither the command nor the config names one. */
export function defaultShell(
  os: OsFamily,
  has: (bin: string) => boolean = (b) => findOnPath(b) !== undefined,
): ShellName {
  if (os === "windows") return has("pwsh") ? "pwsh" : "powershell";
  return has("bash") ? "bash" : "sh";
}

/**
 * Build the argv for a shell. The command text is passed as a single argument
 * (base64 for PowerShell), so no quoting is needed and it can span lines.
 */
export function buildInvocation(shell: ShellName, run: string, os: OsFamily, failFast = false): ShellInvocation {
  switch (shell) {
    case "bash":
    case "sh":
    case "zsh":
      return { file: locateUnixShell(shell, os), args: ["-c", failFast ? `set -e\n${run}` : run] };
    case "pwsh":
    case "powershell":
      return {
        file: shell === "pwsh" ? "pwsh" : "powershell.exe",
        args: [
          "-NoLogo",
          "-NoProfile",
          "-ExecutionPolicy",
          "Bypass",
          "-EncodedCommand",
          encodePowerShell(wrapPowerShell(run, failFast)),
        ],
      };
    case "cmd":
      return { file: "cmd.exe", args: ["/d", "/s", "/c", failFast ? joinCmdSteps(run) : run] };
  }
}

function locateUnixShell(shell: ShellName, os: OsFamily): string {
  if (os !== "windows") return shell;
  // Git Bash is the usual case on Windows. Prefer PATH, then the default install dir.
  const onPath = findOnPath(shell);
  if (onPath) return onPath;
  const programFiles = process.env.ProgramFiles ?? "C:\\Program Files";
  const exe = shell === "zsh" ? "bash" : shell;
  return `${programFiles}\\Git\\bin\\${exe}.exe`;
}

/**
 * PowerShell does not propagate a native command's exit code from -Command
 * reliably, and a failed cmdlet leaves the exit code at 0. Wrap the script so
 * both cases surface as a non-zero exit.
 */
export function wrapPowerShell(run: string, failFast = false): string {
  return [
    ...(failFast ? ["$ErrorActionPreference = 'Stop'", "$PSNativeCommandUseErrorActionPreference = $true"] : []),
    "$global:LASTEXITCODE = 0",
    run,
    "if (-not $?) { if ($LASTEXITCODE) { exit $LASTEXITCODE } else { exit 1 } }",
    "if ($LASTEXITCODE) { exit $LASTEXITCODE }",
    "exit 0",
  ].join("\n");
}

/** cmd.exe only reads the first line of /c, so steps become one && chain. */
export function joinCmdSteps(run: string): string {
  return run
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)
    .join(" && ");
}

export function encodePowerShell(script: string): string {
  return Buffer.from(script, "utf16le").toString("base64");
}

export function runShell(
  shell: ShellName,
  run: string,
  platform: Platform,
  options: RunOptions = {},
): Promise<RunResult> {
  const { file, args } = buildInvocation(shell, run, platform.os, options.failFast ?? false);
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, {
      cwd: options.cwd ?? process.cwd(),
      env: options.env ?? process.env,
      // An isolated process group is not the terminal's foreground group. If
      // it inherits a TTY, reads can trigger SIGTTIN and terminal operations
      // can trigger SIGTTOU, leaving the runner waiting for a stopped child.
      // Isolated commands are non-interactive installers/updaters, so give
      // them EOF on stdin and forward piped output instead of giving them the
      // terminal handles directly.
      stdio: options.capture || options.isolateProcessGroup
        ? ["ignore", "pipe", "pipe"]
        : "inherit",
      detached: options.isolateProcessGroup === true,
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (d: Buffer) => {
      const text = d.toString();
      if (options.capture) stdout += text;
      else process.stdout.write(text);
    });
    child.stderr?.on("data", (d: Buffer) => {
      const text = d.toString();
      if (options.capture) stderr += text;
      else process.stderr.write(text);
    });
    let timer: NodeJS.Timeout | undefined;
    let forceTimer: NodeJS.Timeout | undefined;
    let timedOut = false;
    if (options.timeoutMs) {
      timer = setTimeout(() => {
        timedOut = true;
        const isolated = options.isolateProcessGroup === true;
        terminate(child, isolated, "SIGTERM");
        if (isolated) {
          forceTimer = setTimeout(() => terminate(child, true, "SIGKILL"), 1000);
        }
      }, options.timeoutMs);
    }
    child.on("error", (err) => {
      if (timer) clearTimeout(timer);
      if (forceTimer) clearTimeout(forceTimer);
      reject(err);
    });
    child.on("close", (code, signal) => {
      if (timer) clearTimeout(timer);
      if (forceTimer) clearTimeout(forceTimer);
      resolve({ code: code ?? (signal ? 1 : 0), stdout, stderr, timedOut });
    });
  });
}

function terminate(child: ReturnType<typeof spawn>, isolated: boolean, signal: NodeJS.Signals): void {
  if (isolated && process.platform !== "win32" && child.pid !== undefined) {
    try {
      process.kill(-child.pid, "SIGCONT");
      process.kill(-child.pid, signal);
      return;
    } catch {
      // Fall back to the direct child if the process group disappeared first.
    }
  }
  if (signal === "SIGTERM") child.kill("SIGCONT");
  child.kill(signal);
}
