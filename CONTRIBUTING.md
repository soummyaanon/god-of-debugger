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

- Bump **`plugins/god-of-debugger/.claude-plugin/plugin.json`** `version` when you are preparing a release (see root [README](README.md#versioning)).
- Tag and push per your release process; keep marketplace and plugin versions aligned with maintainer practice.

## Pull request checklist

- [ ] Change is limited to what the PR description claims.
- [ ] Plugin README or root README updated if behavior or layout changed.
- [ ] `plugin.json` version bumped if this is a release-worthy change (coordinate with maintainers if unsure).

## Questions

Open a [GitHub issue](https://github.com/soummyaanon/god-of-debugger/issues) with a short summary and, if relevant, a link to the file you are unsure about.
