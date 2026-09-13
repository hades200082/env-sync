import assert from "node:assert/strict";
import { test } from "node:test";
import { runAll } from "../src/runner.js";
import type { Platform } from "../src/types.js";

const platform: Platform = {
  os: "linux",
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

test("a stuck update is failed after the command timeout", { timeout: 2000 }, async () => {
  const started = Date.now();
  const outcomes = await runAll(
    { tools: [{ name: "stuck", update: "sleep 5" }, { name: "after", update: "true" }] },
    platform,
    { dryRun: false, installOnly: false, statusOnly: false, only: [], skip: [], commandTimeoutMs: 100 },
  );

  assert.deepEqual(outcomes, [
    { name: "stuck", status: "failed", detail: "update timed out" },
    { name: "after", status: "updated" },
  ]);
  assert.ok(Date.now() - started < 1000, "the runner should not wait for the full command");
});
