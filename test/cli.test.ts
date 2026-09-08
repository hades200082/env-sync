import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const here = path.dirname(fileURLToPath(import.meta.url));
const cli = path.resolve(here, "..", "src", "cli.js");

function run(args: string[], cwd?: string) {
  const r = spawnSync(process.execPath, [cli, ...args], {
    encoding: "utf8",
    cwd: cwd ?? process.cwd(),
    env: { ...process.env, ENVSYNC_NO_UPDATE_CHECK: "1", NO_COLOR: "1" },
    timeout: 120_000,
  });
  return { code: r.status, out: (r.stdout ?? "") + (r.stderr ?? "") };
}

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "envsync-test-"));
}

test("--help exits 0 and mentions the config lookup", () => {
  const r = run(["--help"]);
  assert.equal(r.code, 0);
  assert.match(r.out, /envsync\.json/);
});

test("--info prints selectors", () => {
  const r = run(["--info"]);
  assert.equal(r.code, 0);
  assert.match(r.out, /Selectors: .*default/);
});

test("unknown flag exits 2", () => {
  assert.equal(run(["--nope"]).code, 2);
});

test("missing config exits 2 with the search list", () => {
  const dir = tmpDir();
  const r = run([], dir);
  assert.equal(r.code, 2);
  assert.match(r.out, /No envsync\.json found/);
});

test("--init writes a starter config and refuses to overwrite", () => {
  const dir = tmpDir();
  assert.equal(run(["--init"], dir).code, 0);
  assert.ok(fs.existsSync(path.join(dir, "envsync.json")));
  assert.equal(run(["--init"], dir).code, 2);
});

test("invalid config exits 2 and lists problems", () => {
  const dir = tmpDir();
  fs.writeFileSync(path.join(dir, "envsync.json"), `{ "tools": [ { "name": "" } ] }`);
  const r = run([], dir);
  assert.equal(r.code, 2);
  assert.match(r.out, /tools\[0\]\.name/);
});

test("runs a config from the current directory: check, install, update", () => {
  const dir = tmpDir();
  const marker = path.join(dir, "installed.txt").replace(/\\/g, "/");
  const touch = process.platform === "win32" ? `Set-Content -Path '${marker}' -Value ok` : `echo ok > '${marker}'`;
  const config = {
    tools: [
      {
        name: "fake",
        check: `node -e "process.exit(require('fs').existsSync('${marker}') ? 0 : 1)"`,
        install: touch,
        update: "exit 0",
      },
      { name: "nocheck", update: "exit 0" },
      { name: "elsewhere", install: { "no-such-platform": "exit 1" } },
      { name: "off", platforms: ["no-such-platform"], install: "exit 1" },
    ],
  };
  fs.writeFileSync(path.join(dir, "envsync.json"), JSON.stringify(config));

  const first = run(["--verbose"], dir);
  assert.equal(first.code, 0, first.out);
  assert.ok(fs.existsSync(path.join(dir, "installed.txt")), "install command should have run");
  assert.match(first.out, /fake\s+installed/);
  assert.match(first.out, /nocheck\s+updated/);
  assert.match(first.out, /elsewhere\s+unsupported/);
  assert.match(first.out, /off\s+skipped/);

  const second = run([], dir);
  assert.equal(second.code, 0, second.out);
  assert.match(second.out, /fake\s+updated/);

  const status = run(["--status"], dir);
  assert.equal(status.code, 0, status.out);
  assert.match(status.out, /fake\s+present/);
});

test("--dry-run runs checks but not installs", () => {
  const dir = tmpDir();
  const marker = path.join(dir, "should-not-exist.txt").replace(/\\/g, "/");
  const config = { tools: [{ name: "t", check: "exit 1", install: `echo x > '${marker}'` }] };
  fs.writeFileSync(path.join(dir, "envsync.json"), JSON.stringify(config));
  const r = run(["--dry-run"], dir);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /t\s+would-install/);
  assert.ok(!fs.existsSync(path.join(dir, "should-not-exist.txt")));
});

test("a failing install exits 1 and the rest still runs", () => {
  const dir = tmpDir();
  const config = { tools: [{ name: "bad", install: "exit 7" }, { name: "good", update: "exit 0" }] };
  fs.writeFileSync(path.join(dir, "envsync.json"), JSON.stringify(config));
  const r = run([], dir);
  assert.equal(r.code, 1);
  assert.match(r.out, /bad\s+failed/);
  assert.match(r.out, /good\s+updated/);
});

test("--only and --skip filter tools", () => {
  const dir = tmpDir();
  const config = { tools: [{ name: "a", update: "exit 0" }, { name: "b", update: "exit 1" }] };
  fs.writeFileSync(path.join(dir, "envsync.json"), JSON.stringify(config));
  assert.equal(run(["--only", "a"], dir).code, 0);
  assert.equal(run(["--skip", "b"], dir).code, 0);
  assert.equal(run(["--only", "zzz"], dir).code, 2);
});

test("--file with an explicit path and --status reports missing", () => {
  const dir = tmpDir();
  const file = path.join(dir, "custom.json");
  fs.writeFileSync(file, `{ "tools": [ { "name": "m", "check": "no-such-binary-envsync-test", "install": "exit 0" } ] }`);
  const r = run(["--file", file, "--status"], dir);
  assert.equal(r.code, 1);
  assert.match(r.out, /m\s+missing/);
});
