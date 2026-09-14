import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { test } from "node:test";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildInvocation, defaultShell, encodePowerShell, joinCmdSteps, runShell, wrapPowerShell } from "../src/shell.js";
import type { Platform } from "../src/types.js";

const here = path.dirname(fileURLToPath(import.meta.url));

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
  host: [],
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
  assert.equal(ok.timedOut, false);
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

test("an isolated command cannot stop the parent process group", { timeout: 2000 }, async () => {
  if (platform.os === "windows") return;

  const started = Date.now();
  let parentTickAt = 0;
  const parentTimer = setTimeout(() => {
    parentTickAt = Date.now();
  }, 30);
  const command = [
    'marker="/tmp/envsync-isolate-$PPID-$$"',
    'trap \'rm -f "$marker"\' EXIT',
    "pgid=$(ps -o pgid= -p $$ | tr -d ' ')",
    'setsid bash -c "printf ready > $marker; sleep 0.3; kill -CONT -- -$pgid" >/dev/null 2>&1 &',
    "while [ ! -f \"$marker\" ]; do sleep 0.01; done",
    "kill -STOP 0",
    "printf resumed",
  ].join("\n");
  const result = await runShell("bash", command, platform, {
    capture: true,
    timeoutMs: 1000,
    isolateProcessGroup: true,
  });
  clearTimeout(parentTimer);

  assert.ok(parentTickAt !== 0 && parentTickAt - started < 200, "the parent event loop must keep running while the child is stopped");
  assert.equal(result.code, 0);
  assert.equal(result.timedOut, false);
  assert.equal(result.stdout, "resumed");
});

test("an isolated command cannot read the terminal and get stopped", { timeout: 3000 }, async () => {
  if (process.platform !== "linux") return;
  const scriptCheck = spawnSync("script", ["--version"], { stdio: "ignore" });
  if (scriptCheck.error) return;

  const helper = [
    `import { runShell } from ${JSON.stringify(pathToFileURL(path.resolve(here, "../src/shell.js")).href)};`,
    'const result = await runShell("bash", "printf before; read -r value; printf after", { os: "linux" }, { isolateProcessGroup: true, timeoutMs: 300 });',
    "console.log(JSON.stringify(result));",
    "process.exitCode = result.timedOut ? 1 : 0;",
  ].join("\n");
  const command = `${quote(process.execPath)} --input-type=module -e ${quote(helper)}`;
  const probe = spawn("script", ["-qefc", command, "/dev/null"], { stdio: ["pipe", "pipe", "pipe"] });
  let stdout = "";
  let stderr = "";
  probe.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString()));
  probe.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
  const result = await new Promise<{ status: number | null; error?: Error }>((resolve) => {
    const timer = setTimeout(() => {
      probe.kill("SIGKILL");
      resolve({ status: null, error: new Error("PTY probe timed out") });
    }, 2000);
    probe.once("error", (error) => {
      clearTimeout(timer);
      resolve({ status: null, error });
    });
    probe.once("close", (status) => {
      clearTimeout(timer);
      resolve({ status });
    });
  });

  assert.equal(result.error, undefined, `${stdout}\n${stderr}`);
  assert.equal(result.status, 0, `${stdout}\n${stderr}`);
  assert.match(stdout, /after/);
  assert.match(stdout, /"timedOut":false/);
});

test("an isolated stopped command is terminated by the timeout", { timeout: 2000 }, async () => {
  if (platform.os === "windows") return;

  const started = Date.now();
  const result = await runShell("bash", "kill -STOP 0", platform, {
    capture: true,
    timeoutMs: 50,
    isolateProcessGroup: true,
  });

  assert.equal(result.timedOut, true);
  assert.ok(Date.now() - started < 1000, "a stopped child must not defeat the timeout");
});

function quote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}
