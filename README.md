# envsync

One JSON file that lists the CLI tools and agent skills you want. One command that installs or updates them on whatever machine you are sitting at: Ubuntu, Mint, Fedora, macOS, Windows, WSL, or an agent sandbox.

I wrote it because I work across an Ubuntu server, a Linux Mint desktop and a Windows 11 laptop, plus the odd Claude Code sandbox, and one of them was always missing `gh` or running stale skills.

## Usage

1. Make a config file. This writes a starter one into the current directory:

   ```sh
   npx -y envsync@latest --init
   ```

   Add `--global` to write it to `~/.config/envsync/envsync.json` instead, so it is found from any directory.

2. Edit `envsync.json`. Each entry is a tool with a `check`, an `install` and an `update` command. Commands can differ per platform.

3. Run it. Same command on every machine:

   ```sh
   npx -y envsync@latest
   ```

   Tools that are missing get installed. Tools that are present get updated. Anything that fails is reported and the rest carries on.

Useful variations:

```sh
npx -y envsync@latest --status          # just tell me what is missing
npx -y envsync@latest --dry-run         # show what would run
npx -y envsync@latest --only gh         # one tool
npx -y envsync@latest -f ./work.json    # a specific file or URL
npx -y envsync@latest -g you/dotfiles   # envsync.json from a GitHub repo
npx -y envsync@latest --info            # what does this machine look like to envsync?
```

Requires Node 18 or later. No other dependencies.

## Where the config comes from

First hit wins:

1. `--file <path or URL>`. A local file, or an `http(s)` URL that returns the JSON.
2. `--github <owner/repo>`. Reads `envsync.json` from the repo root through `gh`, so private repos work when you are logged in. Falls back to `raw.githubusercontent.com` when `gh` is not installed (public repos only, or set `GITHUB_TOKEN`). `owner/repo@branch` and `owner/repo:path/to/file.json` also work.
3. `./envsync.json` in the current directory.
4. `$XDG_CONFIG_HOME/envsync/envsync.json`, which is `~/.config/envsync/envsync.json` unless you have changed it.
5. `%APPDATA%\envsync\envsync.json` on Windows.

## The config file

Comments and trailing commas are allowed. The `$schema` line gives you completion and validation in VS Code and most editors.

```jsonc
{
  "$schema": "https://raw.githubusercontent.com/hades200082/env-sync/master/schema.json",
  "tools": [
    {
      "name": "gh",
      "check": "gh",
      "install": {
        "apt": "$ENVSYNC_SUDO apt-get update && $ENVSYNC_SUDO apt-get install -y gh",
        "brew": "brew install gh",
        "winget": "winget install --id GitHub.cli --exact"
      },
      "update": {
        "apt": "$ENVSYNC_SUDO apt-get update && $ENVSYNC_SUDO apt-get install -y --only-upgrade gh",
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

[examples/envsync.json](examples/envsync.json) is the starter file. [examples/installers.json](examples/installers.json) has recipes for the common installer shapes.

### Each tool

| Field | What it does |
| --- | --- |
| `name` | Shown in the output. Used by `--only` and `--skip`. |
| `check` | Exit 0 means installed. A bare word such as `"gh"` is looked up on PATH instead of being run, which behaves the same on every OS. Optional. |
| `install` | Runs when the check fails. |
| `update` | Runs when the check passes. |
| `platforms` | Optional list of selectors. The tool is skipped on machines that match none of them. |
| `description` | Free text for your own benefit. |

A tool with no `check` runs `install` and then `update` every time. That is the right shape for the `skills` CLI, where `add` is idempotent and `update` pulls the latest.

After every install or update, envsync re-reads the environment the way a new terminal would (the registry on Windows, a login shell on Linux and macOS) and merges new PATH entries into itself. So `gh` installed by the first tool is available to the `skills` tool that follows without opening a new terminal. If the check still fails after an install, the tool is reported as `unverified` rather than failed.

### Commands

`check`, `install` and `update` all take the same shape. Pick whichever fits:

**A string.** Runs as-is in the default shell for the OS.

```json
"install": "brew install gh"
```

**An array of strings.** One step per line. Stops at the first step that fails (`set -e` in bash, `$ErrorActionPreference = 'Stop'` in PowerShell, `&&` in cmd).

```json
"install": ["curl -fsSL https://example.com/install.sh -o /tmp/i.sh", "sh /tmp/i.sh"]
```

**An object with `run` and `shell`,** when one command needs a specific shell.

```json
"install": { "run": "irm get.scoop.sh | iex", "shell": "pwsh" }
```

**`null`,** to say "nothing to do here" for one platform without it being reported as unsupported.

**A platform map.** Keys are selectors, values are any of the above.

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

This is how one file covers several distros. Each machine gets an ordered list of selectors, most specific first, and a platform map uses the first key it has that appears in that list. `npx -y envsync@latest --info` prints the list for the machine you are on. A Linux Mint 22.1 desktop with apt and snap looks like this:

```
linuxmint-22.1, linuxmint-22, linuxmint, ubuntu, debian, apt, snap, linux, unix, default
```

In order of precedence:

1. Host: `claude-code`, `codex`, `codespaces`, `gitpod`, `ci`, `container`, `wsl`. Only present when you are in one of those. See "Knowing where you are" below.
2. Distro id and version: `ubuntu-24.04`, then `ubuntu-24`. On macOS `macos-15`, on Windows `windows-11` or `windows-10`.
3. Distro id from `/etc/os-release`: `ubuntu`, `linuxmint`, `debian`, `fedora`, `arch`, `alpine`, and so on.
4. What the distro says it is like (`ID_LIKE`). Mint lists `ubuntu` and `debian`. Rocky lists `rhel`, `centos` and `fedora`.
5. Package managers found on PATH: `apt`, `dnf`, `yum`, `pacman`, `zypper`, `apk`, `nix`, `brew`, `port`, `snap`, `flatpak`, `winget`, `choco`, `scoop`.
6. OS family: `linux`, `macos`, `windows`.
7. `unix` for Linux and macOS together. Handy for `curl | sh` installers.
8. `default`.

Most of the time the package manager keys are all you need. Reach for a distro key when one distro needs something different, and for a host key when a sandbox or CI runner does.

## Installer recipes

Most tools ship one of a few installer shapes. All of these are in [examples/installers.json](examples/installers.json).

**A bash script piped from curl.** `unix` covers Linux and macOS. The `<(...)` needs bash, which is the default shell when it exists.

```json
"install": {
  "unix": "bash <(curl -fsSL https://moonrepo.dev/install/proto.sh)",
  "windows": "irm https://moonrepo.dev/install/proto.ps1 | iex"
}
```

**A PowerShell script piped to iex.** That `windows` line above is it. It runs in `pwsh` when installed, otherwise Windows PowerShell 5.1. Both understand `irm | iex`.

**An installer that only needs sh.** Say so, and it runs even on a box without bash.

```json
"install": { "run": "curl -LsSf https://astral.sh/uv/install.sh | sh", "shell": "sh" }
```

**Downloading a binary by hand.** Use the array form so a failed download does not fall through to a broken extract.

```json
"install": {
  "linux": [
    "curl -fsSLo /tmp/tool.tar.gz https://example.com/tool-linux-$(uname -m).tar.gz",
    "mkdir -p \"$HOME/.local/bin\"",
    "tar -xzf /tmp/tool.tar.gz -C \"$HOME/.local/bin\" tool"
  ],
  "windows": [
    "Invoke-WebRequest https://example.com/tool-windows.zip -OutFile \"$env:TEMP\\tool.zip\"",
    "Expand-Archive \"$env:TEMP\\tool.zip\" -DestinationPath \"$env:LOCALAPPDATA\\Programs\\tool\" -Force"
  ]
}
```

**With or without sudo.** `$ENVSYNC_SUDO` is `sudo` on a normal Linux or macOS account and empty when you are already root, as you usually are inside a container or an agent sandbox. One line then works in both places.

```json
"apt": "$ENVSYNC_SUDO apt-get install -y gh"
```

## Knowing where you are

The script can tell when it is not on a plain desktop. The host it finds itself in is passed on in two ways.

As selectors, so a platform map or a tool's `platforms` list can react to it:

| Selector | When |
| --- | --- |
| `claude-code` | Running under Claude Code, local or in its cloud sandbox |
| `codex` | Running under OpenAI Codex |
| `codespaces`, `gitpod` | Hosted workspaces |
| `ci` | `CI` or `GITHUB_ACTIONS` is set |
| `container` | Docker, Podman or Kubernetes |
| `wsl` | Windows Subsystem for Linux |

As environment variables, which every command can read (`$ENVSYNC_OS` in bash, `$env:ENVSYNC_OS` in PowerShell):

| Variable | Example |
| --- | --- |
| `ENVSYNC_OS` | `linux`, `macos`, `windows` |
| `ENVSYNC_ID`, `ENVSYNC_VERSION` | `linuxmint`, `22.1` |
| `ENVSYNC_ARCH` | `x64`, `arm64` |
| `ENVSYNC_HOST` | `claude-code,container` or empty |
| `ENVSYNC_ROOT` | `1` when uid 0 |
| `ENVSYNC_SUDO` | `sudo` or empty |
| `ENVSYNC_INTERACTIVE` | `1` when stdin and stdout are a terminal, so an installer may prompt |
| `ENVSYNC_TERMINAL` | `vscode`, `iTerm.app`, `windows-terminal` or empty |
| `ENVSYNC_SHELL` | The shell running this command: `bash`, `pwsh`, ... |
| `ENVSYNC_SELECTORS` | The full selector list, comma separated |

A tool that should only run inside a sandbox:

```json
{ "name": "sandbox-setup", "platforms": ["claude-code", "codex"], "install": "..." }
```

For Claude Code on the web or Codex, the simplest arrangement is a setup script that runs `npx -y envsync@latest -g you/dotfiles`. Those containers are Ubuntu or Debian as root, so the `apt` selector matches and `$ENVSYNC_SUDO` is empty.

## Shells

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

## Keeping envsync itself current

Always run it as `npx -y envsync@latest`. Without `@latest`, npx will reuse a cached older version. Each run also asks the npm registry whether a newer version exists and prints a one-line note at the end if so. Set `ENVSYNC_NO_UPDATE_CHECK=1` or pass `--no-update-check` to turn that off.

## Releasing a new version

Releases are built by GitHub Actions in [.github/workflows/release.yml](.github/workflows/release.yml).

Day to day, open the Actions tab, pick "Release", click "Run workflow", choose patch, minor or major. The workflow runs the tests, bumps `package.json`, commits, tags `vX.Y.Z`, creates a GitHub release with generated notes, then publishes to npm with provenance.

One-time setup, pick one:

- **npm trusted publishing.** No secret to rotate. Publish the first version by hand with `npm publish` so the package exists. Then on npmjs.com open the package, Settings, "Trusted publisher", choose GitHub Actions, repository `hades200082/env-sync`, workflow `release.yml`.
- **An automation token.** Create one on npmjs.com under Access Tokens and add it to the repo as the `NPM_TOKEN` secret. The workflow uses it when present.

Creating a release by hand in the GitHub UI also works, as long as the tag matches the version in `package.json`. The publish job checks that and refuses otherwise.

## Development

```sh
npm install
npm test          # builds with tsc, then runs node --test against dist/test
node dist/src/cli.js --file examples/installers.json --dry-run
```

Source is TypeScript in [src/](src/), compiled to `dist/`. No runtime dependencies. [examples/envsync.json](examples/envsync.json) is generated from `starterConfig()` in [src/template.ts](src/template.ts) and a test fails if the two drift. Every file in `examples/` is validated by the tests.

## License

GPL-3.0. Copyright Lee Conlin.

You can use, change and share this freely, including at work. If you distribute a modified version, or a program built on it, it has to be under the GPL too, with source available. The copyright stays with me; the license grants you permission, it does not transfer ownership. Full text in [LICENSE](LICENSE).
