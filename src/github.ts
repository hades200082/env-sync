import { spawn } from "node:child_process";
import { findOnPath } from "./which.js";
import { log } from "./log.js";

export const DEFAULT_CONFIG_FILENAME = "envsync.json";

export interface GitHubRef {
  owner: string;
  repo: string;
  ref: string | undefined;
  path: string;
}

/**
 * Parse `owner/repo`, `owner/repo@ref`, `owner/repo:path/to/file.json`
 * or `owner/repo@ref:path`. Path defaults to envsync.json at the repo root.
 */
export function parseGitHubRef(input: string): GitHubRef {
  const trimmed = input.trim().replace(/^https?:\/\/github\.com\//, "").replace(/\.git$/, "");
  const colon = trimmed.indexOf(":");
  const repoPart = colon === -1 ? trimmed : trimmed.slice(0, colon);
  const filePath = colon === -1 ? DEFAULT_CONFIG_FILENAME : trimmed.slice(colon + 1).replace(/^\/+/, "");
  const at = repoPart.indexOf("@");
  const ownerRepo = at === -1 ? repoPart : repoPart.slice(0, at);
  const ref = at === -1 ? undefined : repoPart.slice(at + 1);
  const [owner, repo, ...rest] = ownerRepo.split("/").filter(Boolean);
  if (!owner || !repo || rest.length) {
    throw new Error(`Expected "owner/repo[@ref][:path]", got "${input}"`);
  }
  return { owner, repo, ref: ref || undefined, path: filePath || DEFAULT_CONFIG_FILENAME };
}

/** Read a file from GitHub. Uses `gh` when present (private repos work), else raw.githubusercontent.com. */
export async function fetchFromGitHub(ref: GitHubRef): Promise<string> {
  if (findOnPath("gh")) {
    const endpoint = `repos/${ref.owner}/${ref.repo}/contents/${ref.path}${ref.ref ? `?ref=${encodeURIComponent(ref.ref)}` : ""}`;
    log.debug(`gh api ${endpoint}`);
    const result = await run("gh", ["api", endpoint, "-H", "Accept: application/vnd.github.raw+json"]);
    if (result.code === 0) return result.stdout;
    log.debug(`gh api failed (${result.code}): ${result.stderr.trim()}`);
    log.warn(null, "gh could not read the file, trying raw.githubusercontent.com");
  } else {
    log.debug("gh not found on PATH, using raw.githubusercontent.com (public repos only)");
  }
  const url = `https://raw.githubusercontent.com/${ref.owner}/${ref.repo}/${ref.ref ?? "HEAD"}/${ref.path}`;
  const headers: Record<string, string> = {};
  const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;
  return fetchText(url, headers);
}

export async function fetchText(url: string, headers: Record<string, string> = {}): Promise<string> {
  log.debug(`GET ${url}`);
  const response = await fetch(url, { headers, redirect: "follow" });
  if (!response.ok) {
    throw new Error(`GET ${url} failed: ${response.status} ${response.statusText}`);
  }
  return response.text();
}

function run(file: string, args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(file, args, { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d: Buffer) => (stdout += d.toString()));
    child.stderr.on("data", (d: Buffer) => (stderr += d.toString()));
    child.on("error", (err) => resolve({ code: 1, stdout, stderr: err.message }));
    child.on("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
  });
}
