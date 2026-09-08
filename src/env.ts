import path from "node:path";
import { spawn } from "node:child_process";
import { log } from "./log.js";
import type { Platform } from "./types.js";

const BEGIN = "__ENVSYNC_ENV_BEGIN__";
const END = "__ENVSYNC_ENV_END__";

/**
 * Re-read the environment the way a fresh terminal would see it and merge
 * it into this process, so a tool installed by one step is on PATH for the next.
 *
 * Windows: PATH and other variables come from the registry (Machine + User).
 * Unix: a login shell (interactive first, so ~/.bashrc counts) dumps its env.
 */
export async function refreshEnvironment(
  platform: Platform,
  env: NodeJS.ProcessEnv = process.env,
): Promise<boolean> {
  const fresh = platform.os === "windows" ? await readWindowsEnvironment() : await readUnixEnvironment(env);
  if (!fresh) {
    log.debug("environment refresh: could not read a fresh environment, keeping the current one");
    return false;
  }
  const added = mergeEnvironment(env, fresh, platform.os === "windows");
  if (added.length) log.debug(`environment refresh: new PATH entries: ${added.join(path.delimiter)}`);
  else log.debug("environment refresh: PATH unchanged");
  return true;
}

/**
 * Merge `fresh` into `target`. PATH becomes the fresh PATH followed by any
 * entries only the current process had. Other variables are only added when
 * missing, so nothing the user set for this run is overwritten.
 * Returns the PATH entries that were new.
 */
export function mergeEnvironment(
  target: NodeJS.ProcessEnv,
  fresh: Record<string, string>,
  caseInsensitive: boolean,
): string[] {
  const pathKey = findKey(target, "PATH", caseInsensitive) ?? "PATH";
  const freshPathKey = findKey(fresh, "PATH", caseInsensitive);
  const currentEntries = splitPath(target[pathKey] ?? "");
  const freshEntries = freshPathKey ? splitPath(fresh[freshPathKey] ?? "") : [];
  const norm = (p: string) => (caseInsensitive ? p.toLowerCase() : p).replace(/[\\/]+$/, "");

  const seen = new Set<string>();
  const merged: string[] = [];
  for (const entry of [...freshEntries, ...currentEntries]) {
    const key = norm(entry);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(entry);
  }
  const currentSet = new Set(currentEntries.map(norm));
  const added: string[] = [];
  for (const entry of freshEntries) {
    if (!currentSet.has(norm(entry)) && !added.includes(entry)) added.push(entry);
  }
  target[pathKey] = merged.join(path.delimiter);

  for (const [key, value] of Object.entries(fresh)) {
    if (key.toUpperCase() === "PATH") continue;
    if (findKey(target, key, caseInsensitive) === undefined) target[key] = value;
  }
  return added;
}

function splitPath(value: string): string[] {
  return value
    .split(path.delimiter)
    .map((s) => s.trim())
    .filter(Boolean);
}

function findKey(obj: Record<string, unknown>, key: string, caseInsensitive: boolean): string | undefined {
  if (!caseInsensitive) return key in obj ? key : undefined;
  const upper = key.toUpperCase();
  return Object.keys(obj).find((k) => k.toUpperCase() === upper);
}

async function readWindowsEnvironment(): Promise<Record<string, string> | undefined> {
  // Machine first, then User, matching how Windows builds PATH for a new process.
  const script = [
    "$m = [Environment]::GetEnvironmentVariables('Machine')",
    "$u = [Environment]::GetEnvironmentVariables('User')",
    "$out = @{}",
    "foreach ($k in $m.Keys) { $out[$k] = [string]$m[$k] }",
    "foreach ($k in $u.Keys) { if ($k -ieq 'Path') { $out['Path'] = ($out['Path'] + ';' + $u[$k]) } else { $out[$k] = [string]$u[$k] } }",
    `Write-Output '${BEGIN}'`,
    "Write-Output ($out | ConvertTo-Json -Compress)",
    `Write-Output '${END}'`,
  ].join("\n");
  const encoded = Buffer.from(script, "utf16le").toString("base64");
  const systemRoot = process.env.SystemRoot ?? process.env.windir ?? "C:\\Windows";
  const shells = ["pwsh", "powershell.exe", `${systemRoot}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`];
  for (const shell of shells) {
    const out = await capture(shell, ["-NoLogo", "-NoProfile", "-NonInteractive", "-EncodedCommand", encoded], 15000);
    const parsed = extractJson(out);
    if (parsed) return expandWindowsVariables(parsed);
  }
  return undefined;
}

/** Registry values can hold %SystemRoot% style references; expand them. */
function expandWindowsVariables(vars: Record<string, string>): Record<string, string> {
  const lookup = (name: string): string | undefined => {
    const upper = name.toUpperCase();
    const key = Object.keys(vars).find((k) => k.toUpperCase() === upper);
    if (key !== undefined) return vars[key];
    const envKey = Object.keys(process.env).find((k) => k.toUpperCase() === upper);
    return envKey !== undefined ? process.env[envKey] : undefined;
  };
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(vars)) {
    out[k] = v.replace(/%([^%]+)%/g, (m, name: string) => lookup(name) ?? m);
  }
  return out;
}

async function readUnixEnvironment(env: NodeJS.ProcessEnv): Promise<Record<string, string> | undefined> {
  const shell = env.SHELL && env.SHELL.length > 0 ? env.SHELL : "/bin/sh";
  const dump = `${quote(process.execPath)} -e 'process.stdout.write("${BEGIN}"+JSON.stringify(process.env)+"${END}")'`;
  // Interactive login shell first: Debian/Ubuntu ~/.bashrc returns early when not interactive.
  const attempts: string[][] = [
    ["-ilc", dump],
    ["-lc", dump],
  ];
  for (const args of attempts) {
    const out = await capture(shell, args, 15000, { ...env, TERM: "dumb" });
    const parsed = extractJson(out);
    if (parsed) return parsed;
  }
  return undefined;
}

function quote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

function extractJson(out: string | undefined): Record<string, string> | undefined {
  if (!out) return undefined;
  const start = out.indexOf(BEGIN);
  const end = out.lastIndexOf(END);
  if (start === -1 || end === -1 || end <= start) return undefined;
  try {
    const parsed: unknown = JSON.parse(out.slice(start + BEGIN.length, end).trim());
    if (typeof parsed !== "object" || parsed === null) return undefined;
    const result: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === "string") result[k] = v;
    }
    return result;
  } catch {
    return undefined;
  }
}

function capture(
  file: string,
  args: string[],
  timeoutMs: number,
  env: NodeJS.ProcessEnv = process.env,
): Promise<string | undefined> {
  return new Promise((resolve) => {
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(file, args, { stdio: ["ignore", "pipe", "pipe"], env, windowsHide: true });
    } catch {
      resolve(undefined);
      return;
    }
    let stdout = "";
    child.stdout?.on("data", (d: Buffer) => (stdout += d.toString()));
    child.stderr?.on("data", () => undefined);
    const timer = setTimeout(() => child.kill(), timeoutMs);
    child.on("error", () => {
      clearTimeout(timer);
      resolve(undefined);
    });
    child.on("close", () => {
      clearTimeout(timer);
      resolve(stdout);
    });
  });
}
