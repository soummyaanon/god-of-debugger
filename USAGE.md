# god-of-debugger — usage guide

Short, practical reference. For full install options and host matrix, see [`README.md`](README.md).

## TL;DR

```bash
# 1. install CLI once
npm i -g @bixai/god-of-debugger

# 2. wire it into your host — interactive picker:
god install
#    …or pick directly by flag:
god install --host=cursor         # Cursor
god install --host=codex          # Codex CLI
god install --host=continue       # Continue.dev
god install --host=open           # any open-plugins host

# 3. check status
god doctor
```

> `god install` with no args opens an arrow-key picker. `↑`/`↓` to move, **Enter** to select, `q`/`Ctrl-C` to cancel. Also accepts `j`/`k` and number keys `1-5`. Add `-y` to force non-interactive (`claude`).

## Invoking the workflow

| Host | How you trigger it |
|------|--------------------|
| Claude Code | `/god-of-debugger:go <bug>` (slash command) |
| Cursor | describe the bug in chat — rule auto-triggers; or prefix `@god-of-debugger` |
| Codex CLI | just describe the bug — `AGENTS.md` is always in context |
| Continue.dev | `/god-of-debugger <bug>` in the chat panel |
| open-plugins host | host-dependent; the command lives at `/god-of-debugger:go` |

## Flags (Claude Code slash command)

```text
/god-of-debugger:go [--yolo] [--repro "<cmd>"] <bug description>
```

| Flag | What it does |
|------|--------------|
| `--repro "<cmd>"` | Skip the interactive repro bootstrap. Use your own failing command. |
| `--yolo` | Skip the two interactive gates. **Does NOT** skip the `S==1` fix-refusal rule. |

Examples:

```text
/god-of-debugger:go login returns 500 on valid creds
/god-of-debugger:go --repro "npm test -- auth.spec.ts" auth test flaky on CI
/god-of-debugger:go --yolo flaky websocket reconnect
```

On other hosts, the same concepts apply — just phrase them naturally:

> "use god-of-debugger, repro is `pytest tests/test_payments.py::test_refund`, bug: refund amount is off by one cent"

## The pipeline (what actually happens)

```
1. Repro          → lock a deterministic failing command
2. Localize       → grep, stack, recent files
3. Hypothesize    → 5–8 primary + 2–3 adversarial across ≥4 of 7 axes
                    (data, control-flow, concurrency, config, deps, env, contract)
4. Gate 1         → you approve/edit the hypothesis list
5. Run            → parallel (Claude) or sequential (other hosts) experiments
                    verdict per hypothesis: killed | survived | inconclusive
6. Gate 2         → survival table
7. Fix            → ONLY if exactly one hypothesis survived (S == 1)
8. Promote        → surviving experiment becomes a permanent regression test
```

## The one rule to remember

**The plugin refuses to ship a fix unless `S == 1`.**

- `S > 1` → multiple plausible causes = guessing. You'll see:
  > `<N> hypotheses still alive. Shipping fix now = guessing which one. Run another round of falsification, or explicitly accept you're guessing?`
- `S == 0` → everything got killed. Regenerate hypotheses or tighten experiments.
- `--yolo` skips the interactive gates, **not** this rule.

On Claude Code this is backed by a PreToolUse hook. On other hosts it's a prose rule the model self-polices — ask it to show the survival table before it writes any fix.

## Common recipes

### Flaky test

```text
/god-of-debugger:go --repro "npm test -- --runInBand auth.spec.ts" auth test fails ~30% on CI
```

If the repro hit rate is under 30%, the plugin pauses and offers to harden the repro first.

### Production incident, no local repro

Start without `--repro`; the **repro** skill walks you through building one from logs + stack.

### You just want hypotheses, no experiments

Hit `s` (skip) at Gate 1. You'll get the hypothesis table and can stop there.

### You trust the process, just run it

```text
/god-of-debugger:go --yolo <bug>
```

Gates are skipped. Fix-refusal rule still applies.

## Health check

```bash
god doctor
```

Reports:
- Claude Code install status (version, source, plugin.json).
- Open-plugins layout (`.plugin/`, `.mcp.json`, `.lsp.json`, `.cursor/…`, `AGENTS.md`, `.continue/…`).

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Claude Code doesn't see the plugin | Run `god install`, then **restart Claude Code**. |
| Cursor rule not triggering | Reload window. Check **Settings → Rules** for `god-of-debugger`. |
| Codex ignores the workflow | Confirm `AGENTS.md` is at the directory where you launched `codex`. |
| Continue `/god-of-debugger` not listed | Restart Continue after writing `.continue/config.yaml`. |
| "Existing non-npm install detected" | Run `god update` (or `god uninstall` first). |
| Version drift between manifests | Run `npm run sync-version` at repo root. |

## Uninstall

```bash
god uninstall                    # Claude Code
god uninstall --host=cursor
god uninstall --host=codex
god uninstall --host=continue
god uninstall --host=open
```

## Further reading

- Full pipeline spec: [`plugins/god-of-debugger/commands/go.md`](plugins/god-of-debugger/commands/go.md)
- Per-skill detail: `plugins/god-of-debugger/skills/{repro,debug,run,promote}/SKILL.md`
- Plugin-internal README: [`plugins/god-of-debugger/README.md`](plugins/god-of-debugger/README.md)
