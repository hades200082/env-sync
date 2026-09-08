// Runs the compiled tests. Node's default --test glob also picks up the .ts
// sources on newer versions, so the file list is passed explicitly.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const dir = path.resolve("dist", "test");
const files = fs
  .readdirSync(dir)
  .filter((f) => f.endsWith(".test.js"))
  .map((f) => path.join(dir, f));
const result = spawnSync(process.execPath, ["--test", ...files], { stdio: "inherit" });
process.exit(result.status ?? 1);
