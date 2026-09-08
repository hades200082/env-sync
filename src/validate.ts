import { SHELL_NAMES, type Config, type ToolSpec } from "./types.js";

export class ConfigError extends Error {
  constructor(public readonly problems: string[]) {
    super(`Invalid envsync config:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
    this.name = "ConfigError";
  }
}

const OS_FAMILIES = ["linux", "macos", "windows"];
const TOOL_KEYS = new Set(["name", "description", "check", "install", "update", "platforms"]);
const ROOT_KEYS = new Set(["$schema", "shell", "tools"]);

/** Throws ConfigError with every problem found, not only the first. */
export function validateConfig(input: unknown): Config {
  const problems: string[] = [];
  if (!isRecord(input)) throw new ConfigError(["root must be an object"]);

  for (const key of Object.keys(input)) {
    if (!ROOT_KEYS.has(key)) problems.push(`unknown root key "${key}"`);
  }

  if (input.shell !== undefined) {
    if (!isRecord(input.shell)) problems.push("shell must be an object like { \"windows\": \"pwsh\" }");
    else {
      for (const [os, shell] of Object.entries(input.shell)) {
        if (!OS_FAMILIES.includes(os)) problems.push(`shell.${os}: unknown OS, expected one of ${OS_FAMILIES.join(", ")}`);
        if (typeof shell !== "string" || !(SHELL_NAMES as readonly string[]).includes(shell)) {
          problems.push(`shell.${os}: expected one of ${SHELL_NAMES.join(", ")}`);
        }
      }
    }
  }

  if (!Array.isArray(input.tools)) {
    problems.push("tools must be an array");
    throw new ConfigError(problems);
  }

  const names = new Set<string>();
  input.tools.forEach((tool: unknown, index: number) => {
    const where = `tools[${index}]`;
    if (!isRecord(tool)) {
      problems.push(`${where}: must be an object`);
      return;
    }
    for (const key of Object.keys(tool)) {
      if (!TOOL_KEYS.has(key)) problems.push(`${where}: unknown key "${key}"`);
    }
    if (typeof tool.name !== "string" || tool.name.trim() === "") {
      problems.push(`${where}.name: required, must be a non-empty string`);
    } else {
      if (names.has(tool.name)) problems.push(`${where}.name: duplicate tool name "${tool.name}"`);
      names.add(tool.name);
    }
    if (tool.description !== undefined && typeof tool.description !== "string") {
      problems.push(`${where}.description: must be a string`);
    }
    for (const field of ["check", "install", "update"] as const) {
      if (tool[field] !== undefined) checkCommand(tool[field], `${where}.${field}`, problems);
    }
    if (tool.install === undefined && tool.update === undefined) {
      problems.push(`${where}: needs at least one of install or update`);
    }
    if (tool.platforms !== undefined) {
      if (!Array.isArray(tool.platforms) || !tool.platforms.every((p) => typeof p === "string")) {
        problems.push(`${where}.platforms: must be an array of selector strings`);
      }
    }
  });

  if (problems.length) throw new ConfigError(problems);
  return input as unknown as Config;
}

function isCommandText(value: unknown): boolean {
  return typeof value === "string" || (Array.isArray(value) && value.every((v) => typeof v === "string"));
}

function checkCommand(value: unknown, where: string, problems: string[]): void {
  if (value === null || isCommandText(value)) return;
  if (Array.isArray(value)) {
    problems.push(`${where}: array steps must all be strings`);
    return;
  }
  if (!isRecord(value)) {
    problems.push(`${where}: expected a string, array of strings, null, { "run": ... } or a platform map`);
    return;
  }
  if ("run" in value) {
    checkCommandObject(value, where, problems);
    return;
  }
  if (Object.keys(value).length === 0) {
    problems.push(`${where}: platform map is empty`);
    return;
  }
  for (const [selector, entry] of Object.entries(value)) {
    const inner = `${where}.${selector}`;
    if (entry === null || isCommandText(entry)) continue;
    if (isRecord(entry) && "run" in entry) {
      checkCommandObject(entry, inner, problems);
      continue;
    }
    problems.push(`${inner}: expected a string, array of strings, null or { "run": ... } (platform maps do not nest)`);
  }
}

function checkCommandObject(value: Record<string, unknown>, where: string, problems: string[]): void {
  if (!isCommandText(value.run)) problems.push(`${where}.run: must be a string or array of strings`);
  if (value.shell !== undefined && (typeof value.shell !== "string" || !(SHELL_NAMES as readonly string[]).includes(value.shell))) {
    problems.push(`${where}.shell: expected one of ${SHELL_NAMES.join(", ")}`);
  }
  for (const key of Object.keys(value)) {
    if (key !== "run" && key !== "shell") problems.push(`${where}: unknown key "${key}"`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function toolNames(config: Config): string[] {
  return config.tools.map((t: ToolSpec) => t.name);
}
