import fs from "node:fs";
import path from "node:path";

/** Find an executable on PATH. Honours PATHEXT on Windows. Returns the full path or undefined. */
export function findOnPath(
  name: string,
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): string | undefined {
  if (name.includes("/") || name.includes("\\")) {
    return isExecutable(name, platform) ? name : undefined;
  }
  const pathValue = env.PATH ?? env.Path ?? env.path ?? "";
  const dirs = pathValue.split(path.delimiter).filter(Boolean);
  const exts =
    platform === "win32"
      ? (env.PATHEXT ?? ".COM;.EXE;.BAT;.CMD").split(";").filter(Boolean)
      : [""];
  const hasExt = platform === "win32" && path.extname(name) !== "";
  for (const dir of dirs) {
    if (hasExt || platform !== "win32") {
      const candidate = path.join(dir, name);
      if (isExecutable(candidate, platform)) return candidate;
    }
    if (platform === "win32") {
      for (const ext of exts) {
        const candidate = path.join(dir, name + ext.toLowerCase());
        if (isExecutable(candidate, platform)) return candidate;
      }
    }
  }
  return undefined;
}

function isExecutable(file: string, platform: NodeJS.Platform): boolean {
  try {
    const stat = fs.statSync(file);
    if (!stat.isFile()) return false;
    if (platform === "win32") return true;
    fs.accessSync(file, fs.constants.X_OK);
    return true;
  } catch {
    if (platform !== "win32") return false;
    // App execution aliases (winget, python from the Store) are reparse points
    // that stat() refuses with EACCES. lstat() sees them as symlinks.
    try {
      const l = fs.lstatSync(file);
      return l.isSymbolicLink() || l.isFile();
    } catch {
      return false;
    }
  }
}
