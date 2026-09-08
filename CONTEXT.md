# envsync

envsync provisions one machine from one JSON file. For each tool listed it checks whether the tool is present, installs it if not, and updates it if so. The README, the schema and the code should all use the words below.

## Language

### The config

**Config**:
The JSON document that lists the tools to provision, plus a default shell per OS family.
_Avoid_: manifest, dotfile, envsync.json (that is the filename, not the concept)

**Config source**:
Where the config was read from on this run: a local path, a URL, or a GitHub repo.
_Avoid_: origin, location

**Lookup order**:
The fixed list of places envsync tries when no config source is given. First hit wins.
_Avoid_: search path, fallback chain

**Tool**:
One entry in the config. Something envsync can check for, install and update. A set of agent skills is a tool too.
_Avoid_: entry, package, program, skill

**Command**:
A tool's check, install or update. Written as a string, a list of steps, a command object with its own shell, null, or a platform map.
_Avoid_: script, action, recipe

**Step**:
One line of a multi-line command. The command stops at the first step that fails.
_Avoid_: stage, line

**Path lookup**:
A check written as a bare word. envsync looks it up on PATH instead of running it, so it behaves the same on every OS.
_Avoid_: which check, binary check

**Null command**:
A command written as `null`. It means "nothing to do here" on purpose, so the tool is skipped rather than reported as unsupported.
_Avoid_: empty command, no-op

**Platform map**:
A command keyed by selector. The first key that appears in the machine's selector list wins.
_Avoid_: platform object, per-OS map, variants

**Platform filter**:
A tool's list of selectors. The tool is skipped on a machine that matches none of them.
_Avoid_: targets, condition, platforms (the field name, not the concept)

### The machine

**Machine**:
The box envsync is running on and provisioning: its OS family, distro, version, package managers, and the selectors it answers to.
_Avoid_: platform, system

**Host**:
What the machine is running inside, beyond the OS: `claude-code`, `codex`, `codespaces`, `gitpod`, `ci`, `container` or `wsl`. Empty on a plain desktop. Each host is also a selector.
_Avoid_: environment, sandbox, runtime, context

**Environment**:
The variables and PATH a command sees when it runs. envsync re-reads it after every install or update, the way a new terminal would, so a tool installed by one step is on PATH for the next.
_Avoid_: env, shell state, process env

### Selectors

**Selector**:
A name the current machine answers to, such as `linuxmint-22.1`, `apt`, `unix`, `claude-code` or `default`.
_Avoid_: platform key, tag, target

**Selector list**:
Every selector for the current machine, ordered most specific first. `--info` prints it.
_Avoid_: platform list, precedence list

### The run

**Run**:
One pass over every tool in the config, in file order. A failing tool does not stop the rest.
_Avoid_: sync, session, execution

**Outcome**:
What happened to one tool during a run: a status plus an optional detail. Statuses are present, missing, installed, updated, up-to-date, unverified, skipped, unsupported, failed, would-install and would-update.
_Avoid_: result, report

**Skipped**:
An outcome where nothing ran on purpose: a null command, a platform filter that did not match, `--skip`, or `--install-only`.
_Avoid_: ignored, excluded

**Unsupported**:
An outcome where the config has no install or update command for this machine. A gap in the config, not a choice.
_Avoid_: unavailable, not applicable

**Unverified**:
An outcome where the install ran without error but the check still fails afterwards.
_Avoid_: unconfirmed, partial
