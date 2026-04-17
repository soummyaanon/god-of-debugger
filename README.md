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
8. **Automatically promote the surviving experiment into a regression test** once a fix is accepted, verify the verdict flips, and tag the fix commit with a session trailer. One line of output: `Added N regression tests to tests/.`

All of that happens behind a single slash command (`/god-of-debugger <bug>`) with two inline Enter-to-continue gates, or zero gates under `--yolo`.

## Install

```bash
# Local development
claude --plugin-dir ./god-of-debugger

# Or from a marketplace once published
/plugin install god-of-debugger
```

## Command

One command. The whole pipeline.

| Command | Behavior |
|---|---|
| `/god-of-debugger <bug>` | Runs the full pipeline: repro → localize → primary + adversarial hypotheses → experiment design → parallel execution → survival table → fix (only if exactly one hypothesis survives) → silent promotion to regression tests. Pauses at two inline gates (Enter keeps going). |
| `/god-of-debugger --yolo <bug>` | Same pipeline, zero gates. Prints the final survival table and proposes a fix only if exactly one hypothesis survives. The §5.4 fix-refusal still applies — `--yolo` skips gates, it does not bypass correctness. |
| `/god-of-debugger --repro "<cmd>" <bug>` | Skip the interactive repro bootstrap and use `<cmd>` directly. Combine with `--yolo` for full autopilot. |

### Inline gates (default flow)

```
Found 9 hypotheses (7 primary, 2 adversarial). [Enter] run all · [e] edit · [s] skip review →
3 survived. [Enter] see details · [f] propose fix · [m] more experiments →
```

- `[Enter]` at either gate = keep going (full autopilot without the `--yolo` flag).
- `[e]` at Gate 1 = edit hypotheses (drop rows, rewrite kill conditions, change budgets) before running.
- `[f]` at Gate 2 = propose a fix. Only enabled when exactly one hypothesis survived.
- `[m]` at Gate 2 = run a second round of tighter experiments against the survivors.

### Automatic promotion

When a fix is accepted, surviving experiments are silently converted into permanent regression tests in the repo's detected test directory. You see one line:

```
Added 2 regression tests to tests/.
```

No separate `/promote` command.

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

Default (gated):

```
/god-of-debugger "orders API returns 500 when cart is empty"

# → establishes repro (18/20 hits)
# → localizes bug, emits 7 primary + 2 adversarial hypotheses
# → Gate 1:  Found 9 hypotheses (7 primary, 2 adversarial). [Enter] run all · [e] edit · [s] skip review →
# [Enter]
# → 9 subagents run in parallel, writing to .god-of-debugger/experiments/<Hn>/
# → Gate 2:  3 survived. [Enter] see details · [f] propose fix · [m] more experiments →
# [m]
# → tightens experiments for H3, H4, H6, re-runs
# → Gate 2:  1 survived. [Enter] see details · [f] propose fix · [m] more experiments →
# [f]
# → proposes fix for H3, writes code
# → silently promotes H3 experiment → regression test
# → Added 1 regression test to tests/.
```

Autopilot (`--yolo`):

```
/god-of-debugger --yolo --repro "pytest -k test_checkout" "orders API returns 500 when cart is empty"

# → runs end-to-end with no prompts
# → prints final survival table
# → if exactly 1 survived: writes fix + regression test, closes session
# → if != 1 survived: prints the §5.4 refusal and stops (correctness over speed)
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
