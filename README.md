# envsync

[![npm](https://img.shields.io/npm/v/@hades200082%2Fenvsync)](https://www.npmjs.com/package/@hades200082/envsync)
[![CI](https://github.com/hades200082/env-sync/actions/workflows/ci.yml/badge.svg)](https://github.com/hades200082/env-sync/actions/workflows/ci.yml)

One JSON config for the CLI tools and agent skills you want on every machine.

## Quick start

Requires Node.js 18 or later.

1. Create a starter config:

   ```sh
   npx -y @hades200082/envsync@latest --init
   ```

2. Edit `envsync.json` and add the tools you want to check, install, and update.

3. Run envsync:

   ```sh
   npx -y @hades200082/envsync@latest
   ```

Use `--global` with `--init` to put the config in your user config directory. Use `--status` to check tools without changing the machine, or `--dry-run` to see the commands envsync would run.

Read the [full documentation](https://hades200082.github.io/env-sync/) for configuration, selectors, remote configs, and troubleshooting.
