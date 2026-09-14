---
layout: default
title: Development
description: Run the test suite and update the documentation site.
---

## Set up the project

```sh
git clone https://github.com/hades200082/env-sync.git
cd env-sync
npm install
```

The CLI source is TypeScript in [`src/`](https://github.com/hades200082/env-sync/tree/master/src). The compiler writes JavaScript to `dist/`.

## Test the CLI

```sh
npm test
npm run typecheck
```

The test command builds the project, then runs the compiled tests with Node's test runner. The smoke commands used by CI are:

```sh
node dist/src/cli.js --info
node dist/src/cli.js --file examples/envsync.json --dry-run --no-update-check --verbose
```

## Update the docs

The docs source and Pages site live in [`documenation/`](https://github.com/hades200082/env-sync/tree/master/documenation). Each Markdown page has front matter with a title and description. Add new pages to both `documenation/_config.yml` and the navigation in `documenation/_layouts/default.html` only when they should appear in the menu.

The search index is generated from the pages by `documenation/search.json`. The browser searches that index locally, so the published site does not need an API.

## Publish the site

The `Deploy documentation` workflow runs when changes under `documenation/` reach `master`. It builds the Jekyll site and deploys the result to GitHub Pages.

The repository administrator must enable GitHub Pages with **GitHub Actions** as the source once in the repository settings. After that, a push to `master` publishes the site at:

<https://hades200082.github.io/env-sync/>

Use the workflow's manual dispatch when you need to redeploy the current `master` commit.
