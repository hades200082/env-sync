---
layout: default
title: Selectors
description: Adapt one config to the machine where envsync runs.
---

A selector is a name the current machine answers to. Examples include `linuxmint-22.1`, `apt`, `unix`, `codex`, and `default`.

Run this to see the machine facts and the ordered selector list:

```sh
npx -y @hades200082/envsync@latest --info
```

## Selector order

envsync builds the selector list from most specific to least specific:

1. Host selectors such as `claude-code`, `codex`, `codespaces`, `gitpod`, `ci`, `container`, and `wsl`.
2. OS or distro plus version, such as `ubuntu-24.04`, `linuxmint-22.1`, `macos-15`, or `windows-11`.
3. The distro ID, such as `ubuntu`, `linuxmint`, `debian`, or `fedora`.
4. The distro's `ID_LIKE` values. Linux Mint, for example, can answer to `ubuntu` and `debian`.
5. Package managers found on `PATH`, such as `apt`, `dnf`, `brew`, `winget`, `nix`, or `snap`.
6. The OS family: `linux`, `macos`, or `windows`.
7. `unix` for Linux and macOS.
8. `default`.

The list has no duplicate names. If a platform map contains more than one matching key, the first key in this order wins.

For example, a Linux Mint machine with `apt` can answer with:

```text
linuxmint-22.1, linuxmint-22, linuxmint, ubuntu, debian, apt, linux, unix, default
```

The exact list depends on the machine and detected hosts.

## Platform maps

Use a selector as a key when a command needs to vary by machine:

```json
"install": {
  "linuxmint": "$ENVSYNC_SUDO apt-get install -y foo-mint-build",
  "apt": "$ENVSYNC_SUDO apt-get install -y foo",
  "brew": "brew install foo",
  "winget": "winget install --id Example.Tool --exact",
  "default": null
}
```

The map does not need a key for every OS. If none of its keys match, envsync reports the tool as `unsupported` for that command.

## Platform filters

Add `platforms` to skip an entire tool unless the machine answers to at least one listed selector:

```json
{
  "name": "sandbox-setup",
  "platforms": ["claude-code", "codex", "container"],
  "install": "echo \"running in $ENVSYNC_HOST\""
}
```

This is useful for a tool that belongs only in an agent host, CI run, or container. A filter that does not match produces the `skipped` outcome.

## Host selectors

Host selectors describe where the process runs beyond its OS. envsync can detect:

| Selector | Detected when |
| --- | --- |
| `claude-code` | Claude Code variables are present. |
| `codex` | A `CODEX_` variable is present. |
| `codespaces` | `CODESPACES` is set. |
| `gitpod` | `GITPOD_WORKSPACE_ID` is set. |
| `ci` | `CI` or `GITHUB_ACTIONS` is set. |
| `container` | Docker, Podman, Kubernetes, or a container marker is detected. |
| `wsl` | The Linux kernel reports Windows Subsystem for Linux. |

An ordinary desktop has no host selectors. `wsl` can appear with the Linux selectors because WSL is both a host and a Linux machine.
