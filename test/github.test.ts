import assert from "node:assert/strict";
import { test } from "node:test";
import { parseGitHubRef } from "../src/github.js";

test("owner/repo defaults to envsync.json at HEAD", () => {
  assert.deepEqual(parseGitHubRef("hades200082/env-sync"), {
    owner: "hades200082",
    repo: "env-sync",
    ref: undefined,
    path: "envsync.json",
  });
});

test("ref and path are optional and can be combined", () => {
  assert.deepEqual(parseGitHubRef("o/r@main"), { owner: "o", repo: "r", ref: "main", path: "envsync.json" });
  assert.deepEqual(parseGitHubRef("o/r:configs/work.json"), { owner: "o", repo: "r", ref: undefined, path: "configs/work.json" });
  assert.deepEqual(parseGitHubRef("o/r@v1.2:cfg/x.json"), { owner: "o", repo: "r", ref: "v1.2", path: "cfg/x.json" });
});

test("a full GitHub URL is accepted", () => {
  assert.deepEqual(parseGitHubRef("https://github.com/o/r.git"), { owner: "o", repo: "r", ref: undefined, path: "envsync.json" });
});

test("bad input throws", () => {
  assert.throws(() => parseGitHubRef("just-a-name"));
  assert.throws(() => parseGitHubRef("a/b/c"));
});
