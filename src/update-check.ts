import { log } from "./log.js";

/** Returns the newer version on the registry, or undefined. Never throws; times out fast. */
export async function checkForNewerVersion(name: string, current: string, timeoutMs = 3000): Promise<string | undefined> {
  try {
    const response = await fetch(`https://registry.npmjs.org/${name}/latest`, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return undefined;
    const body = (await response.json()) as { version?: unknown };
    if (typeof body.version !== "string") return undefined;
    return compareVersions(body.version, current) > 0 ? body.version : undefined;
  } catch (err) {
    log.debug(`update check skipped: ${(err as Error).message}`);
    return undefined;
  }
}

/** Compare two dotted versions. Positive when a > b. Pre-release suffixes sort before the release. */
export function compareVersions(a: string, b: string): number {
  const parse = (v: string) => {
    const [core = "", pre] = v.replace(/^v/, "").split("-", 2);
    const nums = core.split(".").map((n) => Number.parseInt(n, 10) || 0);
    while (nums.length < 3) nums.push(0);
    return { nums, pre };
  };
  const pa = parse(a);
  const pb = parse(b);
  for (let i = 0; i < 3; i++) {
    const diff = (pa.nums[i] ?? 0) - (pb.nums[i] ?? 0);
    if (diff !== 0) return diff;
  }
  if (pa.pre && !pb.pre) return -1;
  if (!pa.pre && pb.pre) return 1;
  if (pa.pre && pb.pre) return pa.pre.localeCompare(pb.pre);
  return 0;
}
