import { refreshEnvironment } from "./env.js";
import { c, log } from "./log.js";
import { resolveCommand, type Resolution } from "./resolve.js";
import { defaultShell, runShell } from "./shell.js";
import { findOnPath } from "./which.js";
import type { Config, Platform, ResolvedCommand, ShellName, ToolSpec } from "./types.js";

export interface RunnerOptions {
  dryRun: boolean;
  /** Skip update commands; only install what is missing. */
  installOnly: boolean;
  /** Run checks only and report. */
  statusOnly: boolean;
  only: string[];
  skip: string[];
}

export type OutcomeStatus =
  | "installed"
  | "updated"
  | "up-to-date"
  | "present"
  | "missing"
  | "unverified"
  | "skipped"
  | "unsupported"
  | "failed"
  | "would-install"
  | "would-update";

export interface ToolOutcome {
  name: string;
  status: OutcomeStatus;
  detail?: string;
}

interface Context {
  config: Config;
  platform: Platform;
  options: RunnerOptions;
}

export async function runAll(config: Config, platform: Platform, options: RunnerOptions): Promise<ToolOutcome[]> {
  const ctx: Context = { config, platform, options };
  const outcomes: ToolOutcome[] = [];
  for (const tool of config.tools) {
    if (options.only.length && !options.only.includes(tool.name)) continue;
    if (options.skip.includes(tool.name)) {
      outcomes.push({ name: tool.name, status: "skipped", detail: "--skip" });
      continue;
    }
    outcomes.push(await runTool(tool, ctx));
  }
  return outcomes;
}

async function runTool(tool: ToolSpec, ctx: Context): Promise<ToolOutcome> {
  const { platform, options } = ctx;
  const name = tool.name;

  if (tool.platforms && !tool.platforms.some((p) => platform.selectors.includes(p))) {
    log.step(name, c.dim(`skipped (platforms: ${tool.platforms.join(", ")})`));
    return { name, status: "skipped", detail: "platform filter" };
  }

  const check = resolveCommand(tool.check, platform.selectors);
  const install = resolveCommand(tool.install, platform.selectors);
  const update = resolveCommand(tool.update, platform.selectors);

  if (options.statusOnly) return await reportStatus(tool, check, install, ctx);

  if (check.kind === "command") {
    const present = await runCheck(name, check.command, ctx);
    if (present) {
      log.step(name, "already installed");
      return await maybeUpdate(tool, update, ctx, "up-to-date");
    }
    log.step(name, "not installed");
    const installed = await runInstall(tool, install, ctx);
    if (installed.status !== "installed") return installed;
    if (options.dryRun) return installed;
    const verified = await runCheck(name, check.command, ctx);
    if (!verified) {
      log.warn(name, "install finished but the check still fails. A new terminal may be needed for PATH changes.");
      return { name, status: "unverified" };
    }
    log.ok(name, "installed");
    return installed;
  }

  if (check.kind === "skipped") {
    log.step(name, c.dim(`skipped (check is null for ${check.selector})`));
    return { name, status: "skipped", detail: `check null for ${check.selector}` };
  }

  // No usable check: run install (if any) and then update (if any).
  let installed: ToolOutcome | undefined;
  if (install.kind !== "undefined") {
    installed = await runInstall(tool, install, ctx);
    if (installed.status === "failed" || installed.status === "unsupported") return installed;
  }
  return await maybeUpdate(tool, update, ctx, installed?.status ?? "unsupported");
}

async function reportStatus(tool: ToolSpec, check: Resolution, install: Resolution, ctx: Context): Promise<ToolOutcome> {
  const name = tool.name;
  if (check.kind !== "command") {
    const detail = install.kind === "command" ? "no check command" : "no check or install for this platform";
    log.step(name, c.dim(detail));
    return { name, status: "skipped", detail };
  }
  const present = await runCheck(name, check.command, ctx);
  if (present) {
    log.ok(name, "present");
    return { name, status: "present" };
  }
  log.warn(name, "missing");
  return { name, status: "missing" };
}

/**
 * Run the update command if there is one for this platform. `fallback` is the
 * status to report when nothing runs: "up-to-date" when the check passed,
 * "installed" when install just ran, "unsupported" when nothing at all ran.
 */
async function maybeUpdate(tool: ToolSpec, update: Resolution, ctx: Context, fallback: OutcomeStatus): Promise<ToolOutcome> {
  const name = tool.name;
  if (update.kind === "undefined") {
    if (fallback === "unsupported") log.warn(name, "nothing to run: no install or update command defined");
    return { name, status: fallback };
  }
  // When nothing else ran, an update that is deliberately not run counts as a skip, not a failure.
  const nothingRan = fallback === "unsupported";
  if (ctx.options.installOnly) {
    return nothingRan ? { name, status: "skipped", detail: "--install-only" } : { name, status: fallback };
  }
  if (update.kind === "skipped") {
    log.debug(`${name}: update is null for ${update.selector}`);
    return nothingRan ? { name, status: "skipped", detail: `update null for ${update.selector}` } : { name, status: fallback };
  }
  if (update.kind === "no-match") {
    log.warn(name, `no update command for this platform (have: ${update.available.join(", ")})`);
    return { name, status: fallback };
  }
  if (ctx.options.dryRun) {
    log.step(name, `would run update (${update.command.selector}):`);
    log.command(update.command.run);
    return { name, status: "would-update" };
  }
  log.step(name, `updating (${update.command.selector})`);
  log.command(update.command.run);
  const result = await execute(update.command, ctx);
  if (result !== 0) {
    log.error(name, `update failed with exit code ${result}`);
    return { name, status: "failed", detail: `update exit ${result}` };
  }
  await refreshEnvironment(ctx.platform);
  log.ok(name, "updated");
  return { name, status: "updated" };
}

async function runInstall(tool: ToolSpec, install: Resolution, ctx: Context): Promise<ToolOutcome> {
  const name = tool.name;
  if (install.kind === "undefined") {
    log.warn(name, "no install command defined");
    return { name, status: "unsupported", detail: "no install command" };
  }
  if (install.kind === "skipped") {
    log.step(name, c.dim(`install skipped (null for ${install.selector})`));
    return { name, status: "skipped", detail: `install null for ${install.selector}` };
  }
  if (install.kind === "no-match") {
    log.warn(name, `no install command for this platform (have: ${install.available.join(", ")}; this machine matches: ${ctx.platform.selectors.join(", ")})`);
    return { name, status: "unsupported", detail: "no install command for this platform" };
  }
  if (ctx.options.dryRun) {
    log.step(name, `would run install (${install.command.selector}):`);
    log.command(install.command.run);
    return { name, status: "would-install" };
  }
  log.step(name, `installing (${install.command.selector})`);
  log.command(install.command.run);
  const code = await execute(install.command, ctx);
  if (code !== 0) {
    log.error(name, `install failed with exit code ${code}`);
    return { name, status: "failed", detail: `install exit ${code}` };
  }
  await refreshEnvironment(ctx.platform);
  return { name, status: "installed" };
}

/** A bare word is looked up on PATH; anything else runs and must exit 0. */
async function runCheck(name: string, command: ResolvedCommand, ctx: Context): Promise<boolean> {
  const run = command.run.trim();
  if (run !== "" && !/\s/.test(run)) {
    const found = findOnPath(run);
    log.debug(`${name}: check "${run}" on PATH: ${found ?? "not found"}`);
    return found !== undefined;
  }
  log.debug(`${name}: check: ${run}`);
  try {
    const shell = pickShell(command, ctx);
    const result = await runShell(shell, run, ctx.platform, {
      capture: true,
      failFast: command.failFast,
      timeoutMs: 120_000,
      env: { ...process.env, ENVSYNC_SHELL: shell },
    });
    log.debug(`${name}: check exit ${result.code}`);
    return result.code === 0;
  } catch (err) {
    log.debug(`${name}: check could not start: ${(err as Error).message}`);
    return false;
  }
}

async function execute(command: ResolvedCommand, ctx: Context): Promise<number> {
  try {
    const shell = pickShell(command, ctx);
    const result = await runShell(shell, command.run, ctx.platform, {
      failFast: command.failFast,
      env: { ...process.env, ENVSYNC_SHELL: shell },
    });
    return result.code;
  } catch (err) {
    log.error(null, `could not start shell: ${(err as Error).message}`);
    return 127;
  }
}

function pickShell(command: ResolvedCommand, ctx: Context): ShellName {
  return command.shell ?? ctx.config.shell?.[ctx.platform.os] ?? defaultShell(ctx.platform.os);
}

export function summarize(outcomes: ToolOutcome[]): { text: string; failed: number } {
  const label: Record<OutcomeStatus, (s: string) => string> = {
    installed: c.green,
    updated: c.green,
    "up-to-date": c.green,
    present: c.green,
    missing: c.yellow,
    unverified: c.yellow,
    skipped: c.dim,
    unsupported: c.yellow,
    failed: c.red,
    "would-install": c.cyan,
    "would-update": c.cyan,
  };
  const width = Math.max(4, ...outcomes.map((o) => o.name.length));
  const lines = outcomes.map((o) => {
    const detail = o.detail ? c.dim(`  (${o.detail})`) : "";
    return `  ${o.name.padEnd(width)}  ${label[o.status](o.status)}${detail}`;
  });
  const failed = outcomes.filter((o) => o.status === "failed").length;
  return { text: lines.join("\n"), failed };
}
