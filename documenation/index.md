---
layout: default
home: true
title: envsync documentation
description: Install and update CLI tools and agent skills from one JSON config.
search_exclude: true
---

<section class="hero" aria-labelledby="hero-title">
  <div>
    <p class="hero__eyebrow">One config. Every machine.</p>
    <h1 id="hero-title">Keep your tools ready.</h1>
    <p class="hero__intro">envsync reads one JSON config, checks each tool, then installs or updates what that machine needs. Use the same run on Linux, macOS, Windows, WSL, or an agent host.</p>
    <div class="hero__actions">
      <a class="button button--primary" href="{{ '/quick-start/' | relative_url }}">Start with the quick start</a>
      <a class="button" href="https://github.com/hades200082/env-sync">View the source</a>
    </div>
  </div>
  <pre class="hero__code"><code># create a config
npx -y @hades200082/envsync@latest --init

# provision this machine
npx -y @hades200082/envsync@latest</code></pre>
</section>

<section aria-labelledby="next-step-title">
  <h2 class="section-heading" id="next-step-title">Find your next step</h2>
  <div class="card-grid">
    <a class="card" href="{{ '/quick-start/' | relative_url }}">
      <strong>Quick start</strong>
      <span>Create a config and run envsync in a few minutes.</span>
    </a>
    <a class="card" href="{{ '/configuration/' | relative_url }}">
      <strong>Configuration</strong>
      <span>Learn the fields that make up a config and a tool.</span>
    </a>
    <a class="card" href="{{ '/commands/' | relative_url }}">
      <strong>Commands</strong>
      <span>Choose strings, steps, command objects, or platform maps.</span>
    </a>
    <a class="card" href="{{ '/selectors/' | relative_url }}">
      <strong>Selectors</strong>
      <span>Make one config adapt to OS, distro, package manager, and host.</span>
    </a>
    <a class="card" href="{{ '/config-sources/' | relative_url }}">
      <strong>Config sources</strong>
      <span>Keep a config local, remote, or in a GitHub repository.</span>
    </a>
    <a class="card" href="{{ '/troubleshooting/' | relative_url }}">
      <strong>Troubleshooting</strong>
      <span>Understand outcomes, exit codes, PATH changes, and failures.</span>
    </a>
  </div>
</section>
