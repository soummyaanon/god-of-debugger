# god-of-debugger

[![npm version](https://img.shields.io/npm/v/%40bixai%2Fgod-of-debugger?style=flat-square&logo=npm&label=npm&color=cb3837)](https://www.npmjs.com/package/@bixai/god-of-debugger)
[![Node.js](https://img.shields.io/node/v/%40bixai%2Fgod-of-debugger?style=flat-square&logo=node.js&label=Node&color=339933)](https://github.com/soummyaanon/god-of-debugger)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](LICENSE)

**Falsification-first, hypothesis-driven parallel debugging** for [Claude Code](https://docs.anthropic.com/en/docs/claude-code).

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

## Install (npm — recommended)

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
