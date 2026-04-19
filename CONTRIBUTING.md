# Contributing

Thanks for helping improve **god-of-debugger**. This project is under the [MIT License](LICENSE). By participating, you agree to follow our [Code of Conduct](CODE_OF_CONDUCT.md).

## What this repo is

- **Root** — Claude Code **marketplace** metadata (`.claude-plugin/marketplace.json`).
- **`plugins/god-of-debugger/`** — the **plugin**: command, skills, agents, hooks, and plugin manifest.

Most contributions touch the plugin directory. Only change the marketplace files if you are adding or updating catalog entries.

## How to contribute

1. **Issues first (optional but helpful)** — For larger behavior changes (especially to `skills/debug/SKILL.md`), opening an issue briefly describing the problem and proposed direction helps avoid rework.
2. **Fork and branch** — Use a focused branch per change.
3. **Keep changes scoped** — One logical change per pull request when possible.
4. **Update docs** — If user-facing behavior or install steps change, update [`README.md`](README.md) and/or [`plugins/god-of-debugger/README.md`](plugins/god-of-debugger/README.md).

## Editing the plugin

| Area | Purpose |
|------|---------|
| `plugins/god-of-debugger/commands/` | Slash command definition |
| `plugins/god-of-debugger/skills/` | Core prompts and workflows (`debug`, `repro`, `run`, `promote`) |
| `plugins/god-of-debugger/agents/` | Subagent specs (e.g. hypothesis-runner) |
| `plugins/god-of-debugger/hooks/` | Hook configuration |

Prompt and copy changes should stay **clear, falsifiable, and safe** — the plugin is meant to drive structured debugging, not to bypass user judgment or tool policies.

## Versioning and releases

- **npm / GitHub Actions:** bump **`package.json`** `version` at the repo root. Run `npm run sync-version` (or rely on `prepublishOnly` during `npm publish`) so **`plugins/god-of-debugger/.claude-plugin/plugin.json`** stays in lockstep.
- Tag `v<version>`, push the tag; the publish workflow ships `@bixai/god-of-debugger` to npm. See root [README — Versioning](README.md#versioning).
- If you change only marketplace metadata, coordinate version bumps with maintainers so the catalog and plugin stay coherent.

## Pull request checklist

- [ ] Change is limited to what the PR description claims.
- [ ] Plugin README or root README updated if behavior or layout changed.
- [ ] Root `package.json` version bumped (and `npm run sync-version` run) if this is a release-worthy npm publish (coordinate with maintainers if unsure).

## Questions

Open a [GitHub issue](https://github.com/soummyaanon/god-of-debugger/issues) with a short summary and, if relevant, a link to the file you are unsure about.
