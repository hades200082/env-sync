---
layout: default
title: Troubleshooting
description: Read outcomes and fix the common setup problems.
---

## Start with a dry run

Use these commands to inspect the machine without changing it:

```sh
# only check whether tools are present
npx -y @hades200082/envsync@latest --status

# show the selected install and update commands
npx -y @hades200082/envsync@latest --dry-run --verbose

# print the machine facts and selector order
npx -y @hades200082/envsync@latest --info
```

## No config found

If envsync says it cannot find `envsync.json`, either create one or give it an explicit source:

```sh
npx -y @hades200082/envsync@latest --init
npx -y @hades200082/envsync@latest --file ./path/to/envsync.json
npx -y @hades200082/envsync@latest --github you/dotfiles
```

Check the [lookup order]({{ '/config-sources/' | relative_url }}) when you expect a global config to be found.

## The install succeeds but the check still fails

envsync refreshes the environment after an install, but some installers change shell startup files or require a new terminal. The outcome is `unverified` when the install command exits successfully and the check still fails.

Open a new terminal and run the command again. Use `--verbose` to see the path lookup. If the executable is installed outside the refreshed `PATH`, add its directory to your shell setup or use a check command that knows the install location.

## `unsupported` appears

`unsupported` means the config has no matching install or update command for the current machine. It is a config gap, not a command failure.

Run `--info` and compare the selector list with the keys in your platform map. Add a matching selector, such as `apt`, `brew`, or `windows`, or add `default` if one command is safe everywhere.

Use `null` when you want to skip a selector on purpose. That produces `skipped`, not `unsupported`.

## A command fails

Use `--verbose` to print the command, selected shell, check, and environment details. Then run the command outside envsync to see the installer error without the surrounding output.

For multiple shell steps, use the array form. It stops at the first failing step. Check quoting for the shell selected on that machine. If a command manages its own process group or terminal, set `isolate` to `true` in its command object.

Install and update commands stop after two minutes. Split a long installer into clear steps, or run it outside envsync when it needs interactive work.

## `--status` exits with code 1

This is expected when a check reports a tool as missing. Status mode does not install or update anything. It returns:

- `0` when every checked tool is present
- `1` when a checked tool is missing
- `2` for bad arguments or an unreadable config

Normal runs return `1` when at least one install or update fails. A failing tool does not stop later tools.

## A GitHub config cannot be read

For a private repository, install and authenticate GitHub CLI:

```sh
gh auth status
npx -y @hades200082/envsync@latest --github owner/private-config
```

If `gh` is not installed, only public repositories work through the raw GitHub URL. `--github` accepts `owner/repo`, an optional `@ref`, and an optional `:path`.
