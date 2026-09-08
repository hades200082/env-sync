import type { Command, CommandText, CommandValue, ResolvedCommand, ShellName } from "./types.js";

export function isCommandObject(value: unknown): value is { run: CommandText; shell?: ShellName } {
  return typeof value === "object" && value !== null && "run" in value;
}

export function isPlatformMap(value: Command | undefined): value is Record<string, CommandValue> {
  return typeof value === "object" && value !== null && !Array.isArray(value) && !isCommandObject(value);
}

export type Resolution =
  | { kind: "command"; command: ResolvedCommand }
  | { kind: "skipped"; selector: string }
  | { kind: "undefined" }
  | { kind: "no-match"; available: string[] };

/**
 * Pick the command for this machine. Selectors are ordered most specific
 * first, so `linuxmint` beats `ubuntu` beats `apt` beats `linux` beats `default`.
 */
export function resolveCommand(command: Command | undefined, selectors: string[]): Resolution {
  if (command === undefined) return { kind: "undefined" };
  if (!isPlatformMap(command)) return fromValue(command, "direct");
  for (const selector of selectors) {
    if (Object.prototype.hasOwnProperty.call(command, selector)) {
      return fromValue(command[selector] as CommandValue, selector);
    }
  }
  return { kind: "no-match", available: Object.keys(command) };
}

function fromValue(value: CommandValue, selector: string): Resolution {
  if (value === null) return { kind: "skipped", selector };
  if (typeof value === "string" || Array.isArray(value)) {
    return { kind: "command", command: { ...toText(value), shell: undefined, selector } };
  }
  return { kind: "command", command: { ...toText(value.run), shell: value.shell, selector } };
}

function toText(value: CommandText): { run: string; failFast: boolean } {
  if (typeof value === "string") return { run: value, failFast: false };
  return { run: value.join("\n"), failFast: true };
}
