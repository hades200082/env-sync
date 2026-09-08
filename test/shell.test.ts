import assert from "node:assert/strict";
import { test } from "node:test";
import { buildInvocation, defaultShell, encodePowerShell, joinCmdSteps, runShell, wrapPowerShell } from "../src/shell.js";
import type { Platform } from "../src/types.js";

test("default shell prefers pwsh on Windows and bash elsewhere", () => {
  assert.equal(defaultShell("windows", (b) => b === "pwsh"), "pwsh");
  assert.equal(defaultShell("windows", () => false), "powershell");
  assert.equal(defaultShell("linux", (b) => b === "bash"), "bash");
  assert.equal(defaultShell("macos", () => false), "sh");
});

test("bash gets the command as a single -c argument, with set -e for steps", () => {
  assert.deepEqual(buildInvocation("bash", "a && b", "linux"), { file: "bash", args: ["-c", "a && b"] });
  assert.deepEqual(buildInvocation("bash", "a\nb", "linux", true), { file: "bash", args: ["-c", "set -e\na\nb"] });
});

test("PowerShell gets a base64 UTF-16LE encoded wrapped script", () => {
  const inv = buildInvocation("pwsh", "gh --version", "windows");
  assert.equal(inv.file, "pwsh");
  assert.equal(inv.args[inv.args.length - 2], "-EncodedCommand");
  const decoded = Buffer.from(inv.args[inv.args.length - 1]!, "base64").toString("utf16le");
  assert.equal(decoded, wrapPowerShell("gh --version"));
  assert.ok(decoded.includes("gh --version"));
  assert.ok(decoded.includes("exit $LASTEXITCODE"));
});

test("PowerShell fail-fast adds ErrorActionPreference", () => {
  assert.ok(wrapPowerShell("x", true).startsWith("$ErrorActionPreference = 'Stop'"));
  assert.ok(!wrapPowerShell("x", false).includes("ErrorActionPreference"));
});

test("cmd steps are joined with &&", () => {
  assert.equal(joinCmdSteps("a\r\n b \n\nc"), "a && b && c");
  assert.deepEqual(buildInvocation("cmd", "a\nb", "windows", true).args, ["/d", "/s", "/c", "a && b"]);
});

test("encodePowerShell round-trips", () => {
  assert.equal(Buffer.from(encodePowerShell("héllo"), "base64").toString("utf16le"), "héllo");
});

const platform: Platform = {
  os: process.platform === "win32" ? "windows" : process.platform === "darwin" ? "macos" : "linux",
  id: "test",
  version: "",
  like: [],
  packageManagers: [],
  arch: process.arch,
  wsl: false,
  environment: [],
  interactive: false,
  root: false,
  sudo: "",
  terminal: "",
  selectors: ["default"],
};

test("exit codes come back from the real default shell", async () => {
  const shell = defaultShell(platform.os);
  const ok = await runShell(shell, "exit 0", platform, { capture: true, timeoutMs: 30000 });
  assert.equal(ok.code, 0);
  const bad = await runShell(shell, "exit 3", platform, { capture: true, timeoutMs: 30000 });
  assert.equal(bad.code, 3);
});

test("a missing command is a non-zero exit in the real default shell", async () => {
  const shell = defaultShell(platform.os);
  const r = await runShell(shell, "definitely-not-a-real-command-envsync", platform, { capture: true, timeoutMs: 30000 });
  assert.notEqual(r.code, 0);
});

test("steps stop at the first failure in the real default shell", async () => {
  const shell = defaultShell(platform.os);
  const r = await runShell(shell, "exit 2\necho SHOULD_NOT_PRINT", platform, { capture: true, failFast: true, timeoutMs: 30000 });
  assert.equal(r.code, 2);
  assert.ok(!r.stdout.includes("SHOULD_NOT_PRINT"));
});
