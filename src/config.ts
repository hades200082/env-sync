import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseJsonc } from "./jsonc.js";
import { validateConfig } from "./validate.js";
import { DEFAULT_CONFIG_FILENAME, fetchFromGitHub, fetchText, parseGitHubRef } from "./github.js";
import type { Config } from "./types.js";

export interface ConfigSource {
  file?: string;
  github?: string;
}

export interface LoadedConfig {
  config: Config;
  /** Where it came from, for the log. */
  origin: string;
}

/** Search order when no source is given. First hit wins. */
export function candidatePaths(cwd: string = process.cwd(), env: NodeJS.ProcessEnv = process.env): string[] {
  const home = os.homedir();
  const xdg = env.XDG_CONFIG_HOME && env.XDG_CONFIG_HOME.length > 0 ? env.XDG_CONFIG_HOME : path.join(home, ".config");
  const list = [
    path.join(cwd, DEFAULT_CONFIG_FILENAME),
    path.join(xdg, "envsync", DEFAULT_CONFIG_FILENAME),
  ];
  if (env.APPDATA) list.push(path.join(env.APPDATA, "envsync", DEFAULT_CONFIG_FILENAME));
  return list;
}

export function globalConfigPath(env: NodeJS.ProcessEnv = process.env): string {
  const home = os.homedir();
  const xdg = env.XDG_CONFIG_HOME && env.XDG_CONFIG_HOME.length > 0 ? env.XDG_CONFIG_HOME : path.join(home, ".config");
  return path.join(xdg, "envsync", DEFAULT_CONFIG_FILENAME);
}

export async function loadConfig(source: ConfigSource): Promise<LoadedConfig> {
  if (source.file && source.github) throw new Error("Use either --file or --github, not both");
  if (source.github) {
    const ref = parseGitHubRef(source.github);
    const text = await fetchFromGitHub(ref);
    return parse(text, `github:${ref.owner}/${ref.repo}${ref.ref ? `@${ref.ref}` : ""}:${ref.path}`);
  }
  if (source.file) {
    if (/^https?:\/\//i.test(source.file)) {
      return parse(await fetchText(source.file), source.file);
    }
    const resolved = path.resolve(source.file);
    if (!fs.existsSync(resolved)) throw new Error(`Config file not found: ${resolved}`);
    return parse(fs.readFileSync(resolved, "utf8"), resolved);
  }
  for (const candidate of candidatePaths()) {
    if (fs.existsSync(candidate)) return parse(fs.readFileSync(candidate, "utf8"), candidate);
  }
  throw new Error(
    [
      `No ${DEFAULT_CONFIG_FILENAME} found. Looked in:`,
      ...candidatePaths().map((p) => `  ${p}`),
      "",
      "Create one with `envsync --init`, or point at one with --file <path|url> or --github owner/repo.",
    ].join("\n"),
  );
}

function parse(text: string, origin: string): LoadedConfig {
  let raw: unknown;
  try {
    raw = parseJsonc(text);
  } catch (err) {
    throw new Error(`Could not parse ${origin} as JSON: ${(err as Error).message}`);
  }
  return { config: validateConfig(raw), origin };
}
