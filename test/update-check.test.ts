import assert from "node:assert/strict";
import { test } from "node:test";
import { compareVersions } from "../src/update-check.js";

test("compares dotted versions numerically", () => {
  assert.ok(compareVersions("1.2.10", "1.2.9") > 0);
  assert.ok(compareVersions("0.10.0", "0.9.9") > 0);
  assert.equal(compareVersions("1.0.0", "1.0.0"), 0);
  assert.ok(compareVersions("v2.0.0", "1.9.9") > 0);
});

test("pre-releases sort before the release", () => {
  assert.ok(compareVersions("1.0.0-beta.1", "1.0.0") < 0);
  assert.ok(compareVersions("1.0.0", "1.0.0-rc.1") > 0);
});
