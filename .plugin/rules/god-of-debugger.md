# god-of-debugger — rules

Falsification-first debugging. Apply when user reports a bug, failing test, or unexpected behavior.

## When to invoke

Triggers: stack traces, "why is this failing", "debug this", flaky tests, "my code doesn't work", regression reports.

Run the full pipeline via `/god-of-debugger:go <bug>` (Claude Code) or the equivalent slash command / prompt on other hosts.

## Pipeline (5 steps)

1. **Repro** — establish deterministic failing command before anything else. No repro → no hypotheses.
2. **Localize + Debug** — grep, stack, recent files. Generate 5–8 **primary** hypotheses across ≥4 of 7 axes: data, control-flow, concurrency, config, deps, env, contract. Adversary subagent adds 2–3 from missed categories. Each hypothesis gets one typed experiment (probe | assertion | test) with pre-registered kill/survive condition.
3. **Run** — dispatch one `hypothesis-runner` subagent per hypothesis in parallel (where host supports it; sequential fallback otherwise). Verdicts: `killed | survived | inconclusive`.
4. **Survival gate** — print table. `S = survived + inconclusive`.
5. **Fix + promote** — only if `S == 1`. Minimal fix. Promote surviving experiments into regression tests.

## Non-negotiables (ship-the-fix guard)

- **Never propose a fix when `S != 1`.** Multiple survivors = guessing. Zero survivors = regenerate hypotheses or tighten experiments.
- **`--yolo` skips gates, not fix-refusal.** The S==1 rule is load-bearing.
- **Repro flips mid-run** → halt, harden repro first. Applies even under `--yolo`.
- **Orchestrator stays light.** All heavy work in subagents.
- **Caveman tone.** Terse, technical, no filler, no "I'll now…", no "Let me…".

## Hookless hosts

Hosts without PreToolUse hook support (Cursor, Continue, most generic open-plugins hosts) enforce the ship-the-fix guard as a prose rule. The agent must self-police: check S before any Write/Edit to production code.
