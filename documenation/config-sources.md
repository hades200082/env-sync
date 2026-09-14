---
layout: default
title: Config sources
description: Choose where envsync reads the config for a run.
---

When no source option is given, envsync checks these places in order and uses the first file it finds:

1. `./envsync.json` in the current directory.
2. `$XDG_CONFIG_HOME/envsync/envsync.json`, or `~/.config/envsync/envsync.json` when `XDG_CONFIG_HOME` is not set.
3. `%APPDATA%\\envsync\\envsync.json` on Windows when `APPDATA` is set.

The source options take precedence over this lookup order.

## A local file or URL

Use `--file` for a path or an HTTP(S) URL:

```sh
npx -y @hades200082/envsync@latest --file ./work.json
npx -y @hades200082/envsync@latest --file https://example.com/envsync.json
```

The file must contain a valid config. JSONC comments and trailing commas are accepted.

## A GitHub repository

Use `--github` with a repository reference:

```sh
npx -y @hades200082/envsync@latest --github you/dotfiles
```

The default path is `envsync.json` at the repository root. You can choose a ref and a different path:

```sh
npx -y @hades200082/envsync@latest --github you/dotfiles@work
npx -y @hades200082/envsync@latest --github you/dotfiles:configs/work.json
npx -y @hades200082/envsync@latest --github you/dotfiles@work:configs/work.json
```

The accepted shape is:

```text
owner/repo[@ref][:path]
```

When `gh` is on `PATH`, envsync reads the file through GitHub CLI. This supports private repositories when `gh auth login` has been completed. Without `gh`, envsync uses `raw.githubusercontent.com`, which works for public repositories. Set `GITHUB_TOKEN` or `GH_TOKEN` when the raw request needs a token.

Use either `--file` or `--github` in one run, not both.

## Keep the config in a dotfiles repository

A common setup is:

1. Keep `envsync.json` in a GitHub repository.
2. Install GitHub CLI first if the repository is private.
3. Run envsync with `--github owner/repo` on each machine.

Put `gh` before any tool that depends on it. envsync processes the config in file order and refreshes the environment after each successful install or update.
