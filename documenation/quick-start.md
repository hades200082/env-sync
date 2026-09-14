---
layout: default
title: Quick start
description: Create a config, add the tools you need, and provision a machine.
---

## What you need

- Node.js 18 or later
- A shell that can run `npx`
- Permission to install the tools in your config

envsync has no runtime dependencies. The first run downloads it through `npx`.

## 1. Create a config

Run this in the directory where you want to keep the config:

```sh
npx -y @hades200082/envsync@latest --init
```

This writes `envsync.json`. It does not overwrite an existing file.

To create the config in your user config directory instead, run:

```sh
npx -y @hades200082/envsync@latest --init --global
```

Use `--global` when the same config should apply from every directory on the machine.

## 2. Add your tools

Open `envsync.json` and add the tools you want to provision. This small config installs or updates GitHub CLI on common package managers:

```jsonc
{
  "$schema": "https://raw.githubusercontent.com/hades200082/env-sync/master/schema.json",
  "tools": [
    {
      "name": "gh",
      "description": "GitHub CLI",
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
    }
  ]
}
```

`check` tells envsync how to tell whether a tool is present. A bare word such as `gh` is looked up on `PATH`. The platform maps choose a command for the current machine.

For the full config model, see [Configuration]({{ '/configuration/' | relative_url }}). For command forms and shell choices, see [Commands]({{ '/commands/' | relative_url }}).

## 3. Run envsync

```sh
npx -y @hades200082/envsync@latest
```

envsync processes tools in the order in the file. It installs missing tools, updates present tools, and continues after a tool fails. Install and update commands have a two-minute limit.

## Useful first runs

Use these before you let commands change the machine:

```sh
# show what is present or missing
npx -y @hades200082/envsync@latest --status

# check commands, but do not install or update anything
npx -y @hades200082/envsync@latest --dry-run

# see the machine facts and selector list envsync will use
npx -y @hades200082/envsync@latest --info
```

If you keep the config in a GitHub repository, [Config sources]({{ '/config-sources/' | relative_url }}) shows how to run it without copying the file first.
