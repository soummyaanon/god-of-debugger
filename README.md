# god-of-debugger

Hypothesis-driven, parallel debugging for Claude Code.

Most debugging sessions fail the same way: the model latches onto the first plausible explanation, "fixes" it, and moves on. The real bug either comes back or was never actually diagnosed. This plugin forces a scientific workflow:

1. **Establish a reliable repro** before any hypothesis work.
2. **Localize the bug** to a narrow working set so subagents do not inherit the whole repo by default.
3. **Generate 5–8 primary hypotheses** spanning at least 4 distinct causal axes (data / control-flow / concurrency / config / deps / env / contract).
4. **Run an adversarial pass** that adds 2–3 hypotheses from categories the main pass is biased away from.
5. **Pre-register falsification conditions** before any experiment runs.
6. **Run experiments in parallel** — one subagent per hypothesis, each returning `killed | survived | inconclusive` with budget accounting.
7. **Block fix-shipping** (via a PostToolUse hook) while ≠ 1 hypothesis is alive.
8. **Promote the surviving experiment into a regression test** before the fix, then verify the verdict flips after the fix, and tag the fix commit with a session trailer.

## Install

```bash
# Local development
claude --plugin-dir ./god-of-debugger

# Or from a marketplace once published
/plugin install god-of-debugger
```

## Commands

| Command | When to use |
|---|---|
| `/god-of-debugger:repro <bug>` | Start here. Locks in a deterministic repro + creates session state. |
| `/god-of-debugger:debug` | Generates localized primary hypotheses, then adversarial hypotheses, with pre-registered falsification conditions. |
| `/god-of-debugger:run` | Dispatches one subagent per hypothesis in parallel. Writes artifacts under `.god-of-debugger/experiments/<Hn>/`. |
| `/god-of-debugger:promote` | (Two phases.) Pre-fix: writes a failing regression test. Post-fix: verifies the test passes, re-runs the surviving experiment to confirm the verdict flips, adds the `God-Of-Debugger-Session` commit trailer, closes session. |

## Agents

- `hypothesis-runner` — runs one experiment (probe / assertion / test) with enforced budgets, writes artifacts, returns a strict verdict.
- `adversary` — adds 2–3 explicitly adversarial hypotheses that challenge the main list's category bias.
- `bisect-runner` — specialized for `git bisect` experiments (v0.2).

## Hook

- `PostToolUse` on `Write|Edit`: while a session is `open` and survivor count ≠ 1, blocks edits to production code. Allowlist:
  - `.god-of-debugger/**`
  - Test files (path heuristic)
  - Files carrying a `@god-of-debugger:probe <id>` marker comment
- Hook is a no-op when no `.god-of-debugger/current` pointer exists, or when session status is `closed` / `repro_unstable`.

## Session state

Layout (per-repo, per-branch):

```
.god-of-debugger/
├── current                         plain text: active session_id
├── sessions/
│   └── <session_id>.json           bug, repro, hypotheses, verdicts, survivors, status
│                                   localization, cost_log
└── experiments/
    └── H3/
        ├── preregistered.json      kill/survive conditions frozen before execution
        ├── experiment.md           human-readable spec
        ├── probe.diff              temp edits (for revert)
        ├── run.log                 repro stdout/stderr
        └── verdict.json            strict schema from hypothesis-runner
```

`session_id` = `<8-char-uuid>-<branch-slug>`, so parallel worktrees don't collide.

## Budgets

Defaults per experiment, overridable at approval time:

- wall clock: 120 s
- tokens: 50k
- iterations: 100 repro runs

Budget exhaustion → `inconclusive` with `budget_consumed` recorded. Inconclusive counts toward "alive" for the refusal-to-fix gate.

## Typical flow

```
/god-of-debugger:repro  "orders API returns 500 when cart is empty"
# → runs the command 20x, hit rate 18/20, session opened

/god-of-debugger:debug
# → localizes the bug, emits primary + adversarial hypotheses with origin tags

/god-of-debugger:run
# → 6 subagents in parallel, each writes to .god-of-debugger/experiments/<Hn>/
# → summary preserves origin tags: killed=[H1,H2,H5,H6], survivors=[H3], inconclusive=[H4]

/god-of-debugger:promote
# → writes a failing regression test
# → unlocks fix-shipping for probe-marked files; other edits still blocked

# You (or Claude) implement the fix. Commit.

/god-of-debugger:promote
# → re-runs the test (passes), re-runs H3 experiment (verdict flips to killed)
# → adds God-Of-Debugger-Session trailer to the fix commit
# → closes session
```

## Directory layout

```
god-of-debugger/
├── .claude-plugin/plugin.json
├── skills/
│   ├── repro/SKILL.md      establish deterministic repro + session state
│   ├── debug/SKILL.md      localization + hypothesis generation + adversarial expansion
│   ├── run/SKILL.md        parallel execution orchestration
│   └── promote/SKILL.md    regression test + post-fix verify + telemetry trailer
├── agents/
│   ├── adversary.md
│   ├── hypothesis-runner.md
│   └── bisect-runner.md
├── hooks/
│   ├── hooks.json
│   └── guard-ship-the-fix.sh
└── README.md
```

## Design notes

- **The quality of this plugin is the quality of `skills/debug/SKILL.md`.** Iterate there first.
- The highest-leverage extension is the adversarial pass. It exists to catch config/env/deployment/"premise is wrong" failures that a code-biased model will under-generate.
- Subagent output schemas are strict JSON on purpose — the orchestrator parses verdicts mechanically so it can't be "talked into" a wrong conclusion.
- Pre-registered `kill_condition` / `survive_condition` are part of the protocol, not commentary. If those drift after execution, the system is no longer falsifying.
- `inconclusive` is a first-class verdict. Forcing a `killed`/`survived` call on ambiguous output is the failure mode this plugin exists to prevent.
- MVP ships experiment types 1–3 (probe, assertion, test). Types 4–6 (bisect, dep-pin, env-toggle) are parked until v0.2.
- Token-efficiency is driven first by localization, then by cheap-first experiments, then by prompt caching / model routing. Measure actual cost in `session.cost_log` before optimizing deeper.
- Telemetry is local-only: commit trailers in git, no network calls. A reporting script that walks history for `held/reverted/amended/regressed` outcomes ships in v0.2.

## License

MIT
