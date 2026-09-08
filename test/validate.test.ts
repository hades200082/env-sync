import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { ConfigError, validateConfig } from "../src/validate.js";
import { parseJsonc } from "../src/jsonc.js";
import { starterConfig } from "../src/template.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..");

function problems(input: unknown): string[] {
  try {
    validateConfig(input);
  } catch (err) {
    if (err instanceof ConfigError) return err.problems;
    throw err;
  }
  return [];
}

test("a minimal config passes", () => {
  const cfg = validateConfig({ tools: [{ name: "gh", install: "brew install gh" }] });
  assert.equal(cfg.tools[0]?.name, "gh");
});

test("the starter config passes and matches examples/envsync.json", () => {
  const text = starterConfig();
  validateConfig(parseJsonc(text));
  const example = fs.readFileSync(path.join(repoRoot, "examples", "envsync.json"), "utf8");
  assert.equal(example.replace(/\r\n/g, "\n"), text, "examples/envsync.json is out of date; regenerate it from starterConfig()");
});

test("every file in examples/ is a valid config", () => {
  const dir = path.join(repoRoot, "examples");
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
  assert.ok(files.length >= 2);
  for (const f of files) {
    validateConfig(parseJsonc(fs.readFileSync(path.join(dir, f), "utf8")));
  }
});

test("reports every problem at once", () => {
  const p = problems({
    bogus: 1,
    shell: { windows: "fish", beos: "bash" },
    tools: [{ name: "" }, { name: "a", check: 5, install: { apt: { nested: "x" } } }, { name: "a", update: [1] }],
  });
  assert.ok(p.some((m) => m.includes('unknown root key "bogus"')));
  assert.ok(p.some((m) => m.startsWith("shell.windows")));
  assert.ok(p.some((m) => m.startsWith("shell.beos")));
  assert.ok(p.some((m) => m.startsWith("tools[0].name")));
  assert.ok(p.some((m) => m.startsWith("tools[0]: needs at least one of install or update")));
  assert.ok(p.some((m) => m.startsWith("tools[1].check")));
  assert.ok(p.some((m) => m.startsWith("tools[1].install.apt")));
  assert.ok(p.some((m) => m.includes("duplicate tool name")));
  assert.ok(p.some((m) => m.startsWith("tools[2].update")));
});

test("tools must be an array", () => {
  assert.deepEqual(problems({ tools: {} }), ["tools must be an array"]);
});

test("command objects accept run and shell only", () => {
  const p = problems({ tools: [{ name: "x", install: { run: "a", shell: "cmd", extra: 1 } }] });
  assert.deepEqual(p, ['tools[0].install: unknown key "extra"']);
  assert.deepEqual(problems({ tools: [{ name: "x", install: { run: ["a", "b"], shell: "pwsh" } }] }), []);
});

test("platforms must be strings", () => {
  const p = problems({ tools: [{ name: "x", install: "a", platforms: ["macos", 3] }] });
  assert.deepEqual(p, ["tools[0].platforms: must be an array of selector strings"]);
});
