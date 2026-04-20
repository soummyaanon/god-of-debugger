# god-of-debugger

[![npm version](https://img.shields.io/npm/v/%40bixai%2Fgod-of-debugger?style=flat-square&logo=npm&label=npm&color=cb3837)](https://www.npmjs.com/package/@bixai/god-of-debugger)
[![Node.js](https://img.shields.io/node/v/%40bixai%2Fgod-of-debugger?style=flat-square&logo=node.js&label=Node&color=339933)](https://github.com/soummyaanon/god-of-debugger)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](LICENSE)

**Falsification-first, hypothesis-driven parallel debugging** — ships to Claude Code, Cursor, Codex CLI, Continue.dev, and any [open-plugins](https://open-plugins.com)-compatible host.

**Website:** [godofdebugger.bixai.dev](https://godofdebugger.bixai.dev/) · **Repo:** [github.com/soummyaanon/god-of-debugger](https://github.com/soummyaanon/god-of-debugger) · **Plugin docs:** [`plugins/god-of-debugger/README.md`](plugins/god-of-debugger/README.md)

---

## How it works

1. **You describe the bug** (repro, logs, expected vs actual).
2. The plugin **generates competing hypotheses** across different causal axes—not one “best guess.”
3. **`hypothesis-runner` subagents run in parallel**, each executing one falsifiable experiment and returning a strict verdict: killed, survived, or inconclusive.
4. Results roll up into a **survival table** so you see what evidence actually supports.
5. When you ship a fix, **guards and promote flows** help turn surviving experiments into regression coverage instead of one-off debugging.

Think: *scientific method + parallel agents*, not a single linear “try this, try that” chat.

---

## Supported agents

| Host | Surface | Install command | Parallel subagents | Ship-the-fix hook |
|------|---------|-----------------|:------------------:|:-----------------:|
| **Claude Code** | native plugin | `god install` | yes | yes (PreToolUse) |
| **Cursor** | `.cursor/rules/god-of-debugger.mdc` | `god install --host=cursor` | no (sequential fallback) | prose rule |
| **Codex CLI** | `AGENTS.md` at repo root | `god install --host=codex` | no | prose rule |
| **Continue.dev** | `.continue/config.yaml` | `god install --host=continue` | no | prose rule |
| **open-plugins** | `.plugin/` bundle | `god install --host=open` | host-dependent | host-dependent |

On hosts without PreToolUse hooks, the **"don't propose a fix unless exactly one hypothesis survived"** rule is enforced as a prose rule the model must self-police.

> Short usage guide: [`USAGE.md`](USAGE.md).

## Install — interactive picker (easiest)

If you don't remember host flags, just run:

```bash
npm i -g @bixai/god-of-debugger
god install
```

An arrow-key picker appears:

```text
Pick a host to install god-of-debugger:
❯ Claude Code   native plugin · parallel subagents · PreToolUse hook
  Cursor        writes .cursor/rules/god-of-debugger.mdc
  Codex CLI     writes ./AGENTS.md
  Continue.dev  writes .continue/config.yaml
  open-plugins  copies ./.plugin/ bundle into project
↑/↓ move · enter select · q/ctrl-c cancel
```

Navigate with `↑`/`↓` (or `j`/`k`, or number keys `1-5`), press **Enter** to install. `Ctrl-C` or `q` to cancel. In a non-TTY environment (CI, piped input), it silently defaults to `claude`; add `-y` to force non-interactive mode.

## Install (Claude Code — npm, recommended)

Install the CLI globally, sync the plugin into Claude Code, then **restart Claude Code** so the plugin loads.

```bash
npm i -g @bixai/god-of-debugger
god install
```

After restart, invoke the workflow from Claude Code with:

```text
/god-of-debugger:go
```

### Other package managers

Same flow: global install → `god install` → restart Claude Code.

| Manager | Command |
|--------|---------|
| **pnpm** | `pnpm add -g @bixai/god-of-debugger && god install` |
| **yarn** | `yarn global add @bixai/god-of-debugger && god install` |
| **bun** | `bun add -g @bixai/god-of-debugger && god install` |

### No global install (`npx`)

```bash
npx @bixai/god-of-debugger install
```

Still **restart Claude Code** after `install` so the plugin is picked up.

### CLI maintenance

| Command | What it does |
|---------|----------------|
| `god update` | Refresh the installed plugin from the package |
| `god uninstall` | Remove the plugin from Claude Code |
| `god doctor` | Quick health check |

---

## Install (Cursor)

```bash
npm i -g @bixai/god-of-debugger
cd /path/to/your/project
god install --host=cursor
```

Drops `.cursor/rules/god-of-debugger.mdc` into the project.

Then in Cursor:
1. Reload the window.
2. Open **Cursor Settings → Rules** and confirm `god-of-debugger` is listed.
3. In chat, paste a stack trace or describe the bug. Or force it: `@god-of-debugger debug this failing test`.

Cursor has no subagent dispatch, so experiments run sequentially. The `S==1` fix-refusal rule is enforced as prose.

## Install (Codex CLI)

```bash
npm i -g @bixai/god-of-debugger
cd /path/to/your/project
god install --host=codex
```

Drops `AGENTS.md` at the project root. Codex reads it on every session from that dir.

```bash
codex
> debug this: npm test -- auth.spec.ts
```

If an `AGENTS.md` already exists, the installer refuses to clobber — merge the god-of-debugger section manually.

## Install (Continue.dev)

```bash
npm i -g @bixai/god-of-debugger
cd /path/to/your/project
god install --host=continue
```

Writes `.continue/config.yaml` with a `/god-of-debugger` slash prompt + rule.

Then in Continue's chat panel:

```text
/god-of-debugger login endpoint returns 500 on valid creds
```

## Install (open-plugins host)

```bash
cd /path/to/your/project
god install --host=open
```

Copies the `.plugin/` bundle into the project. Any [open-plugins](https://open-plugins.com)-compliant host picks it up from there.

## No-install path (`npx`) — any host

```bash
npx @bixai/god-of-debugger install --host=cursor
npx @bixai/god-of-debugger install --host=codex
npx @bixai/god-of-debugger install --host=continue
npx @bixai/god-of-debugger install --host=open
```

## Uninstall per host

```bash
god uninstall                    # Claude Code
god uninstall --host=cursor      # removes .cursor/rules/god-of-debugger.mdc
god uninstall --host=codex       # removes AGENTS.md
god uninstall --host=continue    # removes .continue/config.yaml
god uninstall --host=open        # removes .plugin/
```

Run `god doctor` any time to see which hosts are installed.

---

## Install (Claude marketplace)

If you prefer the marketplace flow instead of npm:

```bash
claude plugin marketplace add soummyaanon/god-of-debugger
claude plugin install god-of-debugger@soumyapanda-cc-marketplace
```

In a Claude Code session:

```text
/plugin marketplace add soummyaanon/god-of-debugger
/plugin install god-of-debugger@soumyapanda-cc-marketplace
```

---

## Versioning

- **npm releases:** set `version` in root [`package.json`](package.json). `prepublishOnly` runs `npm run sync-version`, which copies that version into [`plugins/god-of-debugger/.claude-plugin/plugin.json`](plugins/god-of-debugger/.claude-plugin/plugin.json) so the Claude manifest matches the tarball.
- **Ship:** commit, create an annotated tag `v<version>`, push `main` and the tag. [`.github/workflows/publish.yml`](.github/workflows/publish.yml) publishes `@bixai/god-of-debugger` to npm (needs `NPM_TOKEN` in repo secrets).

## Community

- [Contributing](CONTRIBUTING.md)
- [Code of conduct](CODE_OF_CONDUCT.md)
- [Security policy](SECURITY.md)

## License

MIT. See [`LICENSE`](LICENSE).
