import fs from "node:fs";
import os from "node:os";
import { findOnPath } from "./which.js";
import type { OsFamily, Platform } from "./types.js";

/** Raw facts about the machine. Split out so tests can feed fake values. */
export interface PlatformFacts {
  nodePlatform: NodeJS.Platform;
  arch: string;
  /** Contents of /etc/os-release on Linux. */
  osRelease?: string;
  /** os.release() (kernel on Linux, Darwin version on macOS, NT build on Windows). */
  release: string;
  /** Contents of /proc/version, used to spot WSL. */
  procVersion?: string;
  /** Which of the known package manager binaries are on PATH. */
  hasBinary: (name: string) => boolean;
}

interface PackageManager {
  selector: string;
  binaries: string[];
  os: OsFamily[];
}

const PACKAGE_MANAGERS: PackageManager[] = [
  { selector: "apt", binaries: ["apt-get"], os: ["linux"] },
  { selector: "dnf", binaries: ["dnf"], os: ["linux"] },
  { selector: "yum", binaries: ["yum"], os: ["linux"] },
  { selector: "pacman", binaries: ["pacman"], os: ["linux"] },
  { selector: "zypper", binaries: ["zypper"], os: ["linux"] },
  { selector: "apk", binaries: ["apk"], os: ["linux"] },
  { selector: "nix", binaries: ["nix-env", "nix"], os: ["linux", "macos"] },
  { selector: "brew", binaries: ["brew"], os: ["linux", "macos"] },
  { selector: "port", binaries: ["port"], os: ["macos"] },
  { selector: "snap", binaries: ["snap"], os: ["linux"] },
  { selector: "flatpak", binaries: ["flatpak"], os: ["linux"] },
  { selector: "winget", binaries: ["winget"], os: ["windows"] },
  { selector: "choco", binaries: ["choco"], os: ["windows"] },
  { selector: "scoop", binaries: ["scoop"], os: ["windows"] },
];

export const KNOWN_PACKAGE_MANAGERS = PACKAGE_MANAGERS.map((p) => p.selector);

export function gatherFacts(): PlatformFacts {
  const read = (file: string): string | undefined => {
    try {
      return fs.readFileSync(file, "utf8");
    } catch {
      return undefined;
    }
  };
  const facts: PlatformFacts = {
    nodePlatform: process.platform,
    arch: process.arch,
    release: os.release(),
    hasBinary: (name) => findOnPath(name) !== undefined,
  };
  if (process.platform === "linux") {
    const osRelease = read("/etc/os-release") ?? read("/usr/lib/os-release");
    if (osRelease !== undefined) facts.osRelease = osRelease;
    const procVersion = read("/proc/version");
    if (procVersion !== undefined) facts.procVersion = procVersion;
  }
  return facts;
}

export function detectPlatform(facts: PlatformFacts = gatherFacts()): Platform {
  const osFamily = toOsFamily(facts.nodePlatform);
  const arch = facts.arch;
  let id: string = osFamily;
  let version = "";
  let like: string[] = [];
  let wsl = false;

  if (osFamily === "linux") {
    const rel = parseOsRelease(facts.osRelease ?? "");
    id = (rel.ID ?? "linux").toLowerCase();
    version = rel.VERSION_ID ?? "";
    like = (rel.ID_LIKE ?? "")
      .split(/\s+/)
      .map((s) => s.toLowerCase())
      .filter((s) => s && s !== id);
    wsl = /microsoft/i.test(facts.procVersion ?? "") || /microsoft/i.test(facts.release);
  } else if (osFamily === "macos") {
    version = darwinToMacosVersion(facts.release);
  } else {
    version = windowsVersion(facts.release);
  }

  const packageManagers = PACKAGE_MANAGERS.filter(
    (pm) => pm.os.includes(osFamily) && pm.binaries.some((b) => facts.hasBinary(b)),
  ).map((pm) => pm.selector);

  const selectors = buildSelectors({ os: osFamily, id, version, like, packageManagers, arch, wsl });
  return { os: osFamily, id, version, like, packageManagers, arch, wsl, selectors };
}

/**
 * Selector order, most specific first:
 *   id-version, id-major, id, ID_LIKE entries, package managers, wsl, os family, unix, default
 */
export function buildSelectors(p: Omit<Platform, "selectors">): string[] {
  const out: string[] = [];
  const push = (s: string) => {
    if (s && !out.includes(s)) out.push(s);
  };
  if (p.version) {
    push(`${p.id}-${p.version}`);
    const major = p.version.split(".")[0];
    if (major && major !== p.version) push(`${p.id}-${major}`);
  }
  push(p.id);
  for (const l of p.like) push(l);
  for (const pm of p.packageManagers) push(pm);
  if (p.wsl) push("wsl");
  push(p.os);
  if (p.os !== "windows") push("unix");
  push("default");
  return out;
}

export function toOsFamily(nodePlatform: NodeJS.Platform): OsFamily {
  if (nodePlatform === "win32") return "windows";
  if (nodePlatform === "darwin") return "macos";
  return "linux";
}

export function parseOsRelease(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    const quoted =
      (value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"));
    if (quoted) value = value.slice(1, -1);
    out[key] = value.replace(/\\(.)/g, "$1");
  }
  return out;
}

/** Darwin kernel major to marketing version. Darwin 20 is macOS 11, and so on. */
export function darwinToMacosVersion(release: string): string {
  const major = Number.parseInt(release.split(".")[0] ?? "", 10);
  if (Number.isNaN(major)) return "";
  if (major >= 20) return String(major - 9);
  if (major >= 5) return `10.${major - 4}`;
  return "";
}

/** NT build 22000 and above is Windows 11. */
export function windowsVersion(release: string): string {
  const parts = release.split(".");
  const build = Number.parseInt(parts[2] ?? "", 10);
  const major = Number.parseInt(parts[0] ?? "", 10);
  if (major === 10 && !Number.isNaN(build)) return build >= 22000 ? "11" : "10";
  if (!Number.isNaN(major)) return String(major);
  return "";
}

export function describePlatform(p: Platform): string {
  const bits = [`${p.id}${p.version ? " " + p.version : ""}`, p.arch];
  if (p.like.length) bits.push(`like: ${p.like.join(", ")}`);
  if (p.wsl) bits.push("wsl");
  if (p.packageManagers.length) bits.push(`package managers: ${p.packageManagers.join(", ")}`);
  return bits.join(" | ");
}
