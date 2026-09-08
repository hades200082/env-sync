# envsync

One JSON file that says which CLI tools and agent skills you want. One command that installs or updates them on whatever machine you are sitting at.

```sh
npx -y envsync@latest
```

I wrote this because I work across an Ubuntu server, a Linux Mint desktop and a Windows 11 laptop, plus the odd cloud agent sandbox, and I kept finding that one of them was missing `gh` or had stale Claude Code skills. Now each machine runs the same file.

## Quick start

```sh
# 1. Write a starter envsync.json into the current directory
npx -y envsync@latest --init

# 2. Edit it (see "The config file" below)

# 3. Run it. Do this on every machine.
npx -y envsync@latest
```

Put the file in `~/.config/envsync/envsync.json` (`--init --global` does that) and you can run `npx -y envsync@latest` from any directory.

Requires Node 18 or later. No other dependencies.

## Where the config comes from

First hit wins:

1. `--file <path or URL>`. A local file, or an `http(s)` URL that returns the JSON.
2. `--github <owner/repo>`. Reads `envsync.json` from the repo root using `gh`, so private repos work if you are logged in. Falls back to `raw.githubusercontent.com` when `gh` is not installed (public repos only, or set `GITHUB_TOKEN`). You can also say `owner/repo@branch` or `owner/repo:path/to/file.json`.
3. `./envsync.json` in the current directory.
4. `$XDG_CONFIG_HOME/envsync/envsync.json`, which is `~/.config/envsync/envsync.json` unless you have changed it.
5. `%APPDATA%\envsync\envsync.json` on Windows.

```sh
npx -y envsync@latest -f ./work.json
npx -y envsync@latest -f https://example.com/envsync.json
npx -y envsync@latest -g hades200082/dotfiles
npx -y envsync@latest -g hades200082/dotfiles@main:machines/laptop.json
```

## The config file

Comments and trailing commas are allowed.

```jsonc
{
  "$schema": "https://raw.githubusercontent.com/hades200082/env-sync/master/schema.json",
  "tools": [
    {
      "name": "gh",
      "check": "gh",
      "install": {
        "apt": [
          "sudo mkdir -p -m 755 /etc/apt/keyrings",
          "wget -qO- https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo tee /etc/apt/keyrings/githubcli-archive-keyring.gpg > /dev/null",
          "echo \"deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main\" | sudo tee /etc/apt/sources.list.d/github-cli.list > /dev/null",
          "sudo apt-get update",
          "sudo apt-get install -y gh"
        ],
        "brew": "brew install gh",
        "winget": "winget install --id GitHub.cli --exact"
      },
      "update": {
        "apt": "sudo apt-get update && sudo apt-get install -y --only-upgrade gh",
        "brew": "brew upgrade gh || true",
        "winget": "winget upgrade --id GitHub.cli --exact"
      }
    },
    {
      "name": "skills",
      "install": "npx -y skills@latest add mattpocock/skills -a claude-code -g -y",
      "update": "npx -y skills@latest update -g -y"
    }
  ]
}
```

Tools run in the order listed. Put anything a later tool needs, like `gh`, first.

### Each tool

| Field | What it does |
| --- | --- |
| `name` | Shown in the output. Used by `--only` and `--skip`. |
| `check` | Exit 0 means installed. A bare word such as `"gh"` is looked up on PATH instead of being run, which works the same on every OS. Optional. |
| `install` | Runs when the check fails. |
| `update` | Runs when the check passes. |
| `platforms` | Optional list of selectors. The tool is skipped on machines that match none of them. |
| `description` | Free text for your own benefit. |

A tool with no `check` runs `install` and then `update` every time. That is the right shape for things like the `skills` CLI where `add` is idempotent and `update` pulls the latest.

After every install or update, envsync re-reads the environment the way a new terminal would (the registry on Windows, a login shell on Linux and macOS) and merges any new PATH entries into itself. So `gh` installed by the first tool is available to the `skills` tool that follows, without opening a new terminal. If the check still fails after an install, the tool is reported as `unverified` rather than failed.

### Commands

Every one of `check`, `install` and `update` takes the same shape. Pick whichever fits:

A string. Runs as-is in the default shell for the OS.

```json
"install": "brew install gh"
```

An array of strings. One step per line. Stops at the first step that fails (`set -e` in bash, `$ErrorActionPreference = 'Stop'` in PowerShell, `&&` in cmd).

```json
"install": ["curl -fsSL https://example.com/install.sh -o /tmp/i.sh", "sh /tmp/i.sh"]
```

An object with `run` and `shell`, when one command needs a specific shell.

```json
"install": { "run": "irm get.scoop.sh | iex", "shell": "pwsh" }
```

`null`, to say "nothing to do here" for a platform without it being reported as unsupported.

A platform map. Keys are selectors, values are any of the above.

```json
"install": {
  "linuxmint": "sudo apt-get install -y foo-mint-build",
  "apt": "sudo apt-get install -y foo",
  "dnf": "sudo dnf install -y foo",
  "brew": "brew install foo",
  "winget": "winget install foo",
  "default": null
}
```

### Selectors

This is how one file covers Ubuntu, Mint, Fedora, macOS and Windows. Each machine gets an ordered list of selectors, most specific first, and a platform map uses the first key it has that appears in that list. Run `npx -y envsync@latest --info` to see the list for the machine you are on. A Linux Mint 22.1 desktop with apt and snap looks like this:

```
linuxmint-22.1, linuxmint-22, linuxmint, ubuntu, debian, apt, snap, linux, unix, default
```

In order of precedence:

1. Distro id and version: `ubuntu-24.04`, then `ubuntu-24`. On macOS `macos-15`, on Windows `windows-11` or `windows-10`.
2. Distro id from `/etc/os-release`: `ubuntu`, `linuxmint`, `debian`, `fedora`, `arch`, `alpine`, and so on.
3. Whatever the distro says it is like (`ID_LIKE`). Mint lists `ubuntu` and `debian`, Pop!_OS lists `ubuntu debian`, Rocky lists `rhel centos fedora`.
4. Package managers found on PATH: `apt`, `dnf`, `yum`, `pacman`, `zypper`, `apk`, `nix`, `brew`, `port`, `snap`, `flatpak`, `winget`, `choco`, `scoop`.
5. `wsl` when running under Windows Subsystem for Linux.
6. OS family: `linux`, `macos`, `windows`.
7. `unix` for Linux and macOS together. Handy for `curl | sh` installers.
8. `default`.

Most of the time you only need the package manager keys. Reach for a distro key when one distro needs something different.

Your commands also see `ENVSYNC_OS`, `ENVSYNC_ID`, `ENVSYNC_VERSION`, `ENVSYNC_ARCH` and `ENVSYNC_SELECTORS` as environment variables.

### Shells

Defaults are `bash` (or `sh` if bash is missing) on Linux and macOS, and `pwsh` (or Windows PowerShell 5.1 if pwsh is missing) on Windows. Override per OS at the top level:

```json
"shell": { "windows": "cmd" }
```

or per command with `{ "run": "...", "shell": "bash" }`. On Windows, `bash` means Git Bash. Available names: `bash`, `sh`, `zsh`, `pwsh`, `powershell`, `cmd`.

Windows PowerShell 5.1 does not understand `&&`. Use the array form for multi-step commands and it works in both.

## Options

```
-f, --file <path|url>     Config file to use
-g, --github <repo>       GitHub repo holding envsync.json at its root
-o, --only <name>         Run only this tool (repeatable, or comma separated)
-s, --skip <name>         Skip this tool (repeatable, or comma separated)
-n, --dry-run             Show what would run. Checks still run; installs and updates do not.
    --install-only        Install what is missing, skip update commands
    --status              Run the checks and report, change nothing
    --init                Write a starter envsync.json into the current directory
    --global              With --init: write to the global config path instead
    --info                Print what this machine looks like to envsync and exit
    --no-update-check     Do not look for a newer envsync on npm
-v, --verbose             Show commands, checks and environment refresh details
-V, --version             Print version
-h, --help                Show this help
```

Exit code is 0 when everything ran, 1 when an install or update failed (or, with `--status`, when something is missing), 2 for bad arguments or an unreadable config. A failing tool does not stop the others.

## Cloud agent sandboxes

Claude Code on the web, Codex and similar run a fresh Ubuntu or Debian container, usually as root with no `sudo`. The `apt` selector still matches, so a map can carry a root-friendly command. Two options:

- Keep one file and write commands that work in both places, for example `${SUDO:-} apt-get install -y gh` with `SUDO=sudo` set on your own machines.
- Keep a second file for sandboxes and point the sandbox setup script at it: `npx -y envsync@latest -g you/dotfiles:sandbox.json`.

## Keeping envsync itself current

Always run it as `npx -y envsync@latest`. Without `@latest`, npx will happily reuse a cached older version. Each run also asks the npm registry whether a newer version exists and prints a one-line note at the end if so. Set `ENVSYNC_NO_UPDATE_CHECK=1` or pass `--no-update-check` to turn that off.

## Releasing a new version

Releases are built by GitHub Actions in [.github/workflows/release.yml](.github/workflows/release.yml).

Day to day: open the Actions tab, pick "Release", click "Run workflow", choose patch, minor or major. The workflow runs the tests, bumps `package.json`, commits, tags `vX.Y.Z`, creates a GitHub release with generated notes, then publishes to npm with provenance.

One-time setup, pick one:

- **npm trusted publishing** (no secret to rotate). Publish the first version by hand with `npm publish` so the package exists. Then on npmjs.com open the package, Settings, "Trusted publisher", choose GitHub Actions, repository `hades200082/env-sync`, workflow `release.yml`. Done.
- **An automation token.** Create one on npmjs.com under Access Tokens and add it to the repo as the `NPM_TOKEN` secret. The workflow uses it when present.

Creating a release by hand in the GitHub UI also works, as long as the tag matches the version in `package.json`. The publish job checks that and refuses otherwise.

## Development

```sh
npm install
npm test          # builds with tsc, then runs node --test against dist/test
npm run build
node dist/src/cli.js --file examples/envsync.json --dry-run
```

Source is TypeScript in [src/](src/), compiled to `dist/`. There are no runtime dependencies. [examples/envsync.json](examples/envsync.json) is generated from `starterConfig()` in [src/template.ts](src/template.ts) and a test fails if the two drift.

## License

MIT
