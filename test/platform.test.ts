import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildSelectors,
  darwinToMacosVersion,
  detectPlatform,
  parseOsRelease,
  windowsVersion,
  type PlatformFacts,
} from "../src/platform.js";

const MINT = `NAME="Linux Mint"
VERSION="22.1 (Xia)"
ID=linuxmint
ID_LIKE="ubuntu debian"
VERSION_ID="22.1"
`;

const UBUNTU = `PRETTY_NAME="Ubuntu 24.04.1 LTS"
NAME="Ubuntu"
VERSION_ID="24.04"
ID=ubuntu
ID_LIKE=debian
`;

const FEDORA = `NAME="Fedora Linux"
VERSION_ID=40
ID=fedora
`;

function facts(overrides: Partial<PlatformFacts>): PlatformFacts {
  return {
    nodePlatform: "linux",
    arch: "x64",
    release: "6.8.0",
    hasBinary: () => false,
    ...overrides,
  };
}

test("parses os-release with quoted and bare values", () => {
  const rel = parseOsRelease(MINT);
  assert.equal(rel.ID, "linuxmint");
  assert.equal(rel.ID_LIKE, "ubuntu debian");
  assert.equal(rel.VERSION_ID, "22.1");
});

test("Linux Mint gets distro, ID_LIKE, package manager and family selectors in order", () => {
  const p = detectPlatform(facts({ osRelease: MINT, hasBinary: (b) => b === "apt-get" || b === "snap" }));
  assert.equal(p.os, "linux");
  assert.equal(p.id, "linuxmint");
  assert.deepEqual(p.like, ["ubuntu", "debian"]);
  assert.deepEqual(p.selectors, [
    "linuxmint-22.1",
    "linuxmint-22",
    "linuxmint",
    "ubuntu",
    "debian",
    "apt",
    "snap",
    "linux",
    "unix",
    "default",
  ]);
});

test("Ubuntu 24.04 gets id-version and id-major selectors", () => {
  const p = detectPlatform(facts({ osRelease: UBUNTU, hasBinary: (b) => b === "apt-get" }));
  assert.deepEqual(p.selectors.slice(0, 5), ["ubuntu-24.04", "ubuntu-24", "ubuntu", "debian", "apt"]);
});

test("Fedora with an integer version does not repeat the major", () => {
  const p = detectPlatform(facts({ osRelease: FEDORA, hasBinary: (b) => b === "dnf" }));
  assert.deepEqual(p.selectors, ["fedora-40", "fedora", "dnf", "linux", "unix", "default"]);
});

test("WSL adds a wsl selector before the linux family", () => {
  const p = detectPlatform(
    facts({ osRelease: UBUNTU, procVersion: "Linux version 5.15.153.1-microsoft-standard-WSL2" }),
  );
  assert.ok(p.wsl);
  assert.deepEqual(p.selectors, ["ubuntu-24.04", "ubuntu-24", "ubuntu", "debian", "wsl", "linux", "unix", "default"]);
});

test("macOS maps the Darwin version and lists brew", () => {
  const p = detectPlatform(facts({ nodePlatform: "darwin", arch: "arm64", release: "24.1.0", hasBinary: (b) => b === "brew" }));
  assert.equal(p.os, "macos");
  assert.deepEqual(p.selectors, ["macos-15", "macos", "brew", "unix", "default"]);
});

test("Windows 11 is detected from the NT build and has no unix selector", () => {
  const p = detectPlatform(
    facts({ nodePlatform: "win32", release: "10.0.26200", hasBinary: (b) => b === "winget" || b === "scoop" }),
  );
  assert.equal(p.os, "windows");
  assert.equal(p.version, "11");
  assert.deepEqual(p.selectors, ["windows-11", "windows", "winget", "scoop", "default"]);
});

test("Windows 10 build below 22000", () => {
  assert.equal(windowsVersion("10.0.19045"), "10");
  assert.equal(windowsVersion("10.0.22631"), "11");
});

test("Darwin to macOS version", () => {
  assert.equal(darwinToMacosVersion("20.6.0"), "11");
  assert.equal(darwinToMacosVersion("23.4.0"), "14");
  assert.equal(darwinToMacosVersion("19.6.0"), "10.15");
  assert.equal(darwinToMacosVersion("garbage"), "");
});

test("buildSelectors de-duplicates", () => {
  const s = buildSelectors({ os: "linux", id: "debian", version: "12", like: ["debian"], packageManagers: [], arch: "x64", wsl: false });
  assert.deepEqual(s, ["debian-12", "debian", "linux", "unix", "default"]);
});

test("missing os-release still yields usable selectors", () => {
  const p = detectPlatform(facts({}));
  assert.deepEqual(p.selectors, ["linux", "unix", "default"]);
});
