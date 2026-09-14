import assert from "node:assert/strict";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { mergeEnvironment, refreshEnvironment } from "../src/env.js";

// Delimiters are fixed per platform, not taken from the host, so the Windows
// case runs on Linux CI without ":" in "C:\..." being read as a separator.

test("fresh PATH comes first, current-only entries are kept, duplicates dropped", () => {
  const target: NodeJS.ProcessEnv = { PATH: "/usr/bin:/opt/old" };
  const added = mergeEnvironment(target, { PATH: "/home/me/.local/bin:/usr/bin" }, false);
  assert.equal(target.PATH, "/home/me/.local/bin:/usr/bin:/opt/old");
  assert.deepEqual(added, ["/home/me/.local/bin"]);
});

test("Windows PATH is compared case-insensitively and trailing slashes are ignored", () => {
  const target: NodeJS.ProcessEnv = { Path: "C:\\Windows;C:\\Tools\\" };
  const added = mergeEnvironment(target, { Path: "c:\\windows;C:\\tools;C:\\New" }, true);
  assert.deepEqual(added, ["C:\\New"]);
  assert.equal(target.Path, "c:\\windows;C:\\tools;C:\\New");
  assert.equal(Object.keys(target).length, 1, "must not create a second PATH key with different casing");
});

test("other variables are added only when missing", () => {
  const target: NodeJS.ProcessEnv = { PATH: "", KEEP: "mine" };
  mergeEnvironment(target, { PATH: "", KEEP: "theirs", NEW_VAR: "hello" }, false);
  assert.equal(target.KEEP, "mine");
  assert.equal(target.NEW_VAR, "hello");
});

test("environment refresh does not wait for a descendant holding its output pipe", { timeout: 3000 }, async () => {
  if (process.platform === "win32") return;

  const dir = await mkdtemp(path.join(os.tmpdir(), "envsync-refresh-"));
  const shell = path.join(dir, "leaky-shell.mjs");
  await writeFile(
    shell,
    [
      "#!/bin/sh",
      "sleep 1 &",
      "printf '%s' '__ENVSYNC_ENV_BEGIN__{\"PATH\":\"/usr/bin\"}__ENVSYNC_ENV_END__'",
    ].join("\n"),
    "utf8",
  );
  await chmod(shell, 0o755);

  try {
    const platform = {
      os: "linux" as const,
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
    const started = Date.now();
    const ok = await refreshEnvironment(platform, { ...process.env, SHELL: shell });
    assert.equal(ok, true);
    assert.ok(Date.now() - started < 500, "refresh should finish when the shell exits");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
