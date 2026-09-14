---
layout: default
title: Configuration
description: The JSON document that lists the tools to provision.
---

## Config shape

The root object accepts these fields:

| Field | Required | Purpose |
| --- | --- | --- |
| `$schema` | No | URL for editor completion and validation. |
| `shell` | No | Default shell for each OS family. |
| `tools` | Yes | Tools to check, install, or update, in run order. |

`tools` must be an array. Each tool needs a unique `name` and at least one of `install` or `update`.

```jsonc
{
  "$schema": "https://raw.githubusercontent.com/hades200082/env-sync/master/schema.json",
  "shell": {
    "windows": "pwsh"
  },
  "tools": [
    {
      "name": "gh",
      "description": "GitHub CLI",
      "check": "gh",
      "install": {
        "apt": "$ENVSYNC_SUDO apt-get install -y gh",
        "brew": "brew install gh",
        "winget": "winget install --id GitHub.cli --exact"
      },
      "update": {
        "apt": "$ENVSYNC_SUDO apt-get install -y --only-upgrade gh",
        "brew": "brew upgrade gh || true",
        "winget": "winget upgrade --id GitHub.cli --exact"
      }
    }
  ]
}
```

JSONC is accepted, so comments and trailing commas are allowed. Unknown fields and invalid values produce a config error before a run starts. The complete schema is in [`schema.json`](https://github.com/hades200082/env-sync/blob/master/schema.json).

## Tool fields

| Field | Purpose |
| --- | --- |
| `name` | Name shown in output. Also used by `--only` and `--skip`. |
| `description` | Optional text for people reading the config. |
| `check` | Command used to decide whether the tool is present. Optional. |
| `install` | Command used when the check says the tool is missing. |
| `update` | Command used when the check says the tool is present. |
| `platforms` | Optional selector list. The tool is skipped when none match the machine. |

The `check` field is optional. A tool without a check runs its `install` command and then its `update` command on every run. This is useful for an idempotent command such as a skills updater.

## Run order

envsync processes tools from top to bottom. Put a tool first when a later command needs it. For example, install `gh` before a tool that reads a config from a private GitHub repository.

After each install or update, envsync refreshes its [Environment]({{ '/commands/' | relative_url }}#environment-refresh). A new `PATH` entry can therefore be used by the next tool in the same run.

## Example files

- [`examples/envsync.json`](https://github.com/hades200082/env-sync/blob/master/examples/envsync.json) is the starter config.
- [`examples/installers.json`](https://github.com/hades200082/env-sync/blob/master/examples/installers.json) shows common installer shapes.

The [Commands]({{ '/commands/' | relative_url }}) and [Selectors]({{ '/selectors/' | relative_url }}) pages cover the values accepted by each command field.
