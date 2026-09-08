#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { parseArgs, type ParseArgsConfig } from "node:util";
import { globalConfigPath, loadConfig } from "./config.js";
import { c, log, setVerbose } from "./log.js";
import { describePlatform, detectPlatform } from "./platform.js";
import { runAll, summarize, type RunnerOptions } from "./runner.js";
import { starterConfig } from "./template.js";
import { checkForNewerVersion } from "./update-check.js";
import { ConfigError } from "./validate.js";
import { DEFAULT_CONFIG_FILENAME } from "./github.js";

const require = createRequire(import.meta.url);
const pkg = require("../../package.json") as { name: string; version: string };

const HELP = `envsync ${pkg.version}
Install and update your CLI tools and agent skills from one JSON file.

Usage
  npx -y envsync@latest [options]

Config lookup (first hit wins)
  1. --file <path or URL>            any local path or http(s) URL
  2. --github <owner/repo[@ref][:path]>  read from a GitHub repo via gh (falls back to raw URL)
  3. ./${DEFAULT_CONFIG_FILENAME}
  4. $XDG_CONFIG_HOME/envsync/${DEFAULT_CONFIG_FILENAME}  (defaults to ~/.config/envsync/${DEFAULT_CONFIG_FILENAME})
  5. %APPDATA%\\envsync\\${DEFAULT_CONFIG_FILENAME}   (Windows only)

Options
  -f, --file <path|url>     Config file to use
  -g, --github <repo>       GitHub repo holding ${DEFAULT_CONFIG_FILENAME} at its root
  -o, --only <name>         Run only this tool (repeatable, or comma separated)
  -s, --skip <name>         Skip this tool (repeatable, or comma separated)
  -n, --dry-run             Show what would run. Checks still run; installs and updates do not.
      --install-only        Install what is missing, skip update commands
      --status              Run the checks and report, change nothing
      --init                Write a starter ${DEFAULT_CONFIG_FILENAME} into the current directory
      --global              With --init: write to the global config path instead
      --info                Print what this machine looks like to envsync and exit
      --no-update-check     Do not look for a newer envsync on npm
  -v, --verbose             Show commands, checks and environment refresh details
  -V, --version             Print version
  -h, --help                Show this help

Exit codes
  0  everything ran (or, with --status, everything present)
  1  at least one install or update failed (or, with --status, something is missing)
  2  bad arguments or unreadable config
`;

async function main(argv: string[]): Promise<number> {
  const options = {
    file: { type: "string", short: "f" },
    github: { type: "string", short: "g" },
    only: { type: "string", short: "o", multiple: true },
    skip: { type: "string", short: "s", multiple: true },
    "dry-run": { type: "boolean", short: "n", default: false },
    "install-only": { type: "boolean", default: false },
    status: { type: "boolean", default: false },
    init: { type: "boolean", default: false },
    global: { type: "boolean", default: false },
    info: { type: "boolean", default: false },
    "no-update-check": { type: "boolean", default: false },
    verbose: { type: "boolean", short: "v", default: false },
    version: { type: "boolean", short: "V", default: false },
    help: { type: "boolean", short: "h", default: false },
  } as const satisfies ParseArgsConfig["options"];
  let flags: ReturnType<typeof parse>["values"];
  const parse = () => parseArgs({ args: argv, options, allowPositionals: false, strict: true });
  try {
    flags = parse().values;
  } catch (err) {
    log.error(null, (err as Error).message);
    console.error(HELP);
    return 2;
  }
  setVerbose(Boolean(flags.verbose));

  if (flags.help) {
    console.log(HELP);
    return 0;
  }
  if (flags.version) {
    console.log(pkg.version);
    return 0;
  }

  const platform = detectPlatform();
  if (flags.info) {
    console.log(`${c.bold("Platform:")}  ${describePlatform(platform)}`);
    console.log(`${c.bold("Selectors:")} ${platform.selectors.join(", ")}`);
    console.log(c.dim("A platform map picks the first selector above that it has a key for."));
    return 0;
  }

  if (flags.init) return writeStarter(Boolean(flags.global));

  const updatePromise = flags["no-update-check"] || process.env.ENVSYNC_NO_UPDATE_CHECK
    ? Promise.resolve(undefined)
    : checkForNewerVersion(pkg.name, pkg.version);

  let loaded;
  try {
    const source: { file?: string; github?: string } = {};
    if (flags.file) source.file = flags.file;
    if (flags.github) source.github = flags.github;
    loaded = await loadConfig(source);
  } catch (err) {
    log.error(null, err instanceof ConfigError ? err.message : (err as Error).message);
    return 2;
  }

  const runnerOptions: RunnerOptions = {
    dryRun: Boolean(flags["dry-run"]),
    installOnly: Boolean(flags["install-only"]),
    statusOnly: Boolean(flags.status),
    only: splitList(flags.only),
    skip: splitList(flags.skip),
  };
  const known = new Set(loaded.config.tools.map((t) => t.name));
  for (const name of [...runnerOptions.only, ...runnerOptions.skip]) {
    if (!known.has(name)) {
      log.error(null, `Unknown tool "${name}". Tools in ${loaded.origin}: ${[...known].join(", ")}`);
      return 2;
    }
  }

  process.env.ENVSYNC_OS = platform.os;
  process.env.ENVSYNC_ID = platform.id;
  process.env.ENVSYNC_VERSION = platform.version;
  process.env.ENVSYNC_ARCH = platform.arch;
  process.env.ENVSYNC_SELECTORS = platform.selectors.join(",");

  log.info(`${c.bold("envsync")} ${pkg.version}  ${c.dim(describePlatform(platform))}`);
  log.info(`${c.dim("config:")} ${loaded.origin}`);
  if (runnerOptions.dryRun) log.info(c.yellow("dry run: nothing will be installed or updated"));
  log.info("");

  const outcomes = await runAll(loaded.config, platform, runnerOptions);
  const summary = summarize(outcomes);
  log.info("");
  log.info(c.bold("Summary"));
  log.info(summary.text);

  const newer = await updatePromise;
  if (newer) {
    log.info("");
    log.info(c.yellow(`A newer envsync is available (${newer}, you have ${pkg.version}). Run: npx -y envsync@latest`));
  }

  if (runnerOptions.statusOnly) return outcomes.some((o) => o.status === "missing") ? 1 : 0;
  return summary.failed > 0 ? 1 : 0;
}

function writeStarter(global: boolean): number {
  const target = global ? globalConfigPath() : path.resolve(DEFAULT_CONFIG_FILENAME);
  if (fs.existsSync(target)) {
    log.error(null, `${target} already exists, not overwriting`);
    return 2;
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, starterConfig(), "utf8");
  log.info(`Wrote ${target}`);
  log.info(c.dim("Edit it, then run: npx -y envsync@latest"));
  return 0;
}

function splitList(values: string[] | undefined): string[] {
  if (!values) return [];
  return values
    .flatMap((v) => v.split(","))
    .map((v) => v.trim())
    .filter(Boolean);
}

main(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code;
  },
  (err: unknown) => {
    log.error(null, err instanceof Error ? (err.stack ?? err.message) : String(err));
    process.exitCode = 2;
  },
);
