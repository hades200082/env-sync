import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import { mergeEnvironment } from "../src/env.js";

const d = path.delimiter;

test("fresh PATH comes first, current-only entries are kept, duplicates dropped", () => {
  const target: NodeJS.ProcessEnv = { PATH: ["/usr/bin", "/opt/old"].join(d) };
  const added = mergeEnvironment(target, { PATH: ["/home/me/.local/bin", "/usr/bin"].join(d) }, false);
  assert.equal(target.PATH, ["/home/me/.local/bin", "/usr/bin", "/opt/old"].join(d));
  assert.deepEqual(added, ["/home/me/.local/bin"]);
});

test("Windows PATH is compared case-insensitively and trailing slashes are ignored", () => {
  const target: NodeJS.ProcessEnv = { Path: ["C:\\Windows", "C:\\Tools\\"].join(d) };
  const added = mergeEnvironment(target, { Path: ["c:\\windows", "C:\\tools", "C:\\New"].join(d) }, true);
  assert.deepEqual(added, ["C:\\New"]);
  assert.equal(target.Path, ["c:\\windows", "C:\\tools", "C:\\New"].join(d));
  assert.equal(Object.keys(target).length, 1, "must not create a second PATH key with different casing");
});

test("other variables are added only when missing", () => {
  const target: NodeJS.ProcessEnv = { PATH: "", KEEP: "mine" };
  mergeEnvironment(target, { PATH: "", KEEP: "theirs", NEW_VAR: "hello" }, false);
  assert.equal(target.KEEP, "mine");
  assert.equal(target.NEW_VAR, "hello");
});
