---
description: Auto-chain repro -> debug -> run in one invocation. Still pauses at hypothesis approval and refuses to fix while >1 hypothesis survives.
argument-hint: <bug description or path to bug report>
---

Run the full god-of-debugger pipeline for the bug below, chaining skills in order. **Two human gates are mandatory — do not bypass them.**

Bug: $ARGUMENTS

## Pipeline

1. **Repro** — Invoke the `repro` skill. Establish a reliable reproduction command and write it to `.god-of-debugger/sessions/<id>.json`. If the user did not supply a repro, run the interactive bootstrap. If repro hit rate < 30%, halt and surface the choice (statistical verdicts vs harden repro) per PRD §2.5. Do NOT proceed silently.

2. **Debug** — Invoke the `debug` skill. Generate 5–8 hypotheses spanning ≥4 causal axes (data, control-flow, concurrency, config/env, dependency, contract/boundary, resource/quota). Reject clustered sets. Bind each hypothesis to a typed experiment (log probe, assertion, unit test for v0.1). Write hypotheses to session state.

   **GATE 1 — hypothesis approval (mandatory).** Present the hypothesis table. STOP and wait for explicit user approval ("approve", "edit", "drop Hn"). Do not run experiments until the user has reviewed and approved. This gate is non-negotiable.

3. **Run** — After approval, invoke the `run` skill. Dispatch one hypothesis-runner subagent per approved hypothesis in parallel. Aggregate structured verdicts. Present the survival table.

   **GATE 2 — fix-refusal (mandatory).** If the survival table shows != 1 surviving hypothesis, DO NOT propose a fix. Surface the refusal message from PRD §5.4 and offer: (a) another round of falsification, (b) tighten experiments, or (c) declare a tie. The PreToolUse hook will also block edits — do not attempt to bypass it.

4. **Promote** — Do NOT auto-invoke `promote`. That requires the user to have actually landed a fix, which is outside this pipeline. Tell the user to run `/god-of-debugger:promote` after the fix commit lands.

## Degenerate outcomes (PRD §2.6)

- All hypotheses killed → re-prompt once with negative evidence, weighted toward uncovered axes. Cap two rounds then hand back.
- Zero killed (all survived/inconclusive) → offer to tighten experiments before adding hypotheses.
- Repro flaky mid-session → halt, mark session `repro_unstable`, route to repro hardening.

## What auto mode is NOT

Auto mode chains the commands. It does not remove the gates. The friction at hypothesis approval and fix-refusal is the entire point of this plugin.
