---
layout: default
title: Commands
description: Choose the command form and shell that fit each tool.
---

Every `check`, `install`, and `update` field accepts a command value. A command can be a string, a list of steps, a command object, `null`, or a platform map.

## A string

A string runs as one command in the selected shell:

```json
"install": "brew install gh"
```

The default shell is `bash` on Unix systems when it is available, then `sh`. On Windows it is `pwsh` when it is available, then Windows PowerShell. Set a default per OS in the root `shell` field, or set a shell on one command object.

Supported shell names are `bash`, `sh`, `zsh`, `pwsh`, `powershell`, and `cmd`.

## A list of steps

Use an array when a command has multiple steps:

```json
"install": [
  "curl -fsSL https://example.com/tool.tar.gz -o /tmp/tool.tar.gz",
  "mkdir -p \"$HOME/.local/bin\"",
  "tar -xzf /tmp/tool.tar.gz -C \"$HOME/.local/bin\" tool"
]
```

envsync stops at the first failed step. It uses `set -e` in Bash and `sh`, `$ErrorActionPreference = 'Stop'` in PowerShell, and `&&` in `cmd`.

## A command object

Use an object when a command needs a named shell or its own process group:

```json
"install": {
  "run": "irm https://astral.sh/uv/install.ps1 | iex",
  "shell": "pwsh"
}
```

Set `isolate` to `true` for a non-interactive command that manages its own terminal or process group:

```json
"update": {
  "run": "opencode upgrade",
  "isolate": true
}
```

An isolated command receives EOF on standard input and runs in its own process group. This keeps terminal signals local to that command.

## `null`

Use `null` when nothing should run for a selector. envsync reports a deliberate skip rather than an unsupported command:

```json
"update": {
  "linux": null,
  "windows": "winget upgrade --id Example.Tool --exact"
}
```

See [Selectors]({{ '/selectors/' | relative_url }}) for how envsync chooses the key in a platform map.

## Platform maps

A platform map uses selectors as keys. envsync checks the machine's selector list from most specific to least specific and uses the first matching key:

```json
"install": {
  "linuxmint": "sudo apt-get install -y foo-mint-build",
  "apt": "$ENVSYNC_SUDO apt-get install -y foo",
  "brew": "brew install foo",
  "winget": "winget install --id Example.Tool --exact",
  "default": null
}
```

The value for each key can be any command form except another platform map. A platform map without a matching key is reported as `unsupported`.

## Checks

A bare word with no whitespace is a path lookup. For example, `"check": "gh"` checks whether `gh` is on `PATH` instead of starting a shell command. A check with spaces runs in a shell and must exit with code 0 to count as present.

## Environment refresh

After every successful install or update, envsync re-reads the environment the way a new terminal would. It updates `PATH` and other platform values before the next tool runs. This lets a tool installed by one command be found by the next command without opening another terminal.

Every command can read these variables. The syntax depends on the shell:

| Variable | Example | Meaning |
| --- | --- | --- |
| `ENVSYNC_OS` | `linux` | OS family: `linux`, `macos`, or `windows`. |
| `ENVSYNC_ID` | `linuxmint` | Distro ID, or the OS family on macOS and Windows. |
| `ENVSYNC_VERSION` | `22.1` | Distro or OS version when known. |
| `ENVSYNC_ARCH` | `x64` | Machine architecture. |
| `ENVSYNC_HOST` | `codex,container` | Hosts detected around the machine. |
| `ENVSYNC_SUDO` | `sudo` or empty | Privilege prefix for a non-root Unix machine. |
| `ENVSYNC_INTERACTIVE` | `1` or `0` | Whether input and output are terminals. |
| `ENVSYNC_TERMINAL` | `vscode` | Terminal name when detected. |
| `ENVSYNC_SELECTORS` | `ubuntu-24.04,apt,...` | The full selector list, most specific first. |

## Time limits and output

Install and update commands have a two-minute limit. A timed-out command is reported as failed, and envsync continues with later tools. Use `--verbose` to print checks, selected commands, shells, and environment refresh details.
