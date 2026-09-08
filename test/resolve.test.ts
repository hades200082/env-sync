import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveCommand } from "../src/resolve.js";

const MINT = ["linuxmint-22.1", "linuxmint-22", "linuxmint", "ubuntu", "debian", "apt", "linux", "unix", "default"];
const WINDOWS = ["windows-11", "windows", "winget", "default"];

test("a plain string applies everywhere", () => {
  const r = resolveCommand("echo hi", WINDOWS);
  assert.deepEqual(r, { kind: "command", command: { run: "echo hi", failFast: false, shell: undefined, selector: "direct" } });
});

test("undefined stays undefined", () => {
  assert.deepEqual(resolveCommand(undefined, MINT), { kind: "undefined" });
});

test("the most specific selector wins", () => {
  const cmd = { debian: "deb", apt: "apt", ubuntu: "ubu", linux: "lin", default: "def" };
  const r = resolveCommand(cmd, MINT);
  assert.equal(r.kind, "command");
  if (r.kind === "command") {
    assert.equal(r.command.run, "ubu");
    assert.equal(r.command.selector, "ubuntu");
  }
});

test("falls through to the package manager and then default", () => {
  assert.equal((resolveCommand({ apt: "a", default: "d" }, MINT) as { command: { run: string } }).command.run, "a");
  assert.equal((resolveCommand({ dnf: "f", default: "d" }, MINT) as { command: { run: string } }).command.run, "d");
});

test("null means deliberately skipped", () => {
  assert.deepEqual(resolveCommand({ windows: null, default: "x" }, WINDOWS), { kind: "skipped", selector: "windows" });
});

test("no matching key reports what was available", () => {
  assert.deepEqual(resolveCommand({ macos: "brew", apt: "apt" }, WINDOWS), { kind: "no-match", available: ["macos", "apt"] });
});

test("a { run, shell } object carries its shell", () => {
  const r = resolveCommand({ windows: { run: "dir", shell: "cmd" } }, WINDOWS);
  assert.deepEqual(r, { kind: "command", command: { run: "dir", failFast: false, shell: "cmd", selector: "windows" } });
});

test("an array of steps is joined with newlines and marked fail-fast", () => {
  const r = resolveCommand(["one", "two"], MINT);
  assert.deepEqual(r, { kind: "command", command: { run: "one\ntwo", failFast: true, shell: undefined, selector: "direct" } });
  const inMap = resolveCommand({ apt: ["a", "b"] }, MINT);
  assert.equal(inMap.kind, "command");
  if (inMap.kind === "command") assert.equal(inMap.command.failFast, true);
});
