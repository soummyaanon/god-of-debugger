---
description: Internal step of /god-of-debugger. Dispatches one hypothesis-runner subagent per hypothesis in parallel and aggregates their verdicts into a survival table. Invoked automatically by the main command after hypotheses are written to session state.
---

# Run — Parallel Experiment Execution

You orchestrate the experiments designed by the `debug` skill. Each hypothesis gets its own subagent (`hypothesis-runner`, or `bisect-runner` for bisect experiments). Subagents run in **parallel** and return a strict verdict.

This skill also maintains the session `cost_log`. Do not optimize blindly; record what happened.

## Inputs

1. `.god-of-debugger/current` → active `session_id`.
2. `.god-of-debugger/sessions/<session_id>.json` → bug, repro, localization, hypotheses.

If either is missing, STOP and tell the user to run `/god-of-debugger:repro` and `/god-of-debugger:debug` first.

## Pre-flight checks

- Session must have ≥2 hypotheses with `experiment` specs.
- Session `status` must be `open` (not `closed`, not `repro_unstable`).
- Skip any hypothesis listed in `session.parked` — those require runners not in v0.1.

## Orchestration contract

1. For every non-parked hypothesis, dispatch one subagent **in a single message with multiple Task tool calls**:
   - `experiment.kind == "bisect"` → `bisect-runner`
   - otherwise → `hypothesis-runner`
2. Pass each subagent only: `{ session_id, bug_summary, repro: {command, hit_rate}, hypothesis, budget, repo_path }`. Never pass other hypotheses or prior verdicts — isolation is the point.
3. Wait for all verdicts. Do not early-exit.
4. For each verdict, ensure the subagent wrote `.god-of-debugger/experiments/<Hn>/preregistered.json`, `verdict.json`, `probe.diff` (if any edit was made), and `run.log`. If artifacts are missing, mark the hypothesis `inconclusive` with `evidence: "runner returned incomplete artifacts"`.
5. Update `session.hypotheses[i]` with `verdict`, `evidence`, `artifact_path`, `budget_consumed`, `retries`, `confidence`, and `falsification_check`.
6. Append per-run usage into `session.cost_log.runs[]` with hypothesis id, origin, model, and token usage if available.
7. Write the survivor set to `session.survivors` and touch `session.updated_at`.

## Output format

Print the aggregated table to the user:

```json
{
  "session_id": "<id>",
  "summary": [
    {
      "id": "H1",
      "origin": "primary",
      "axis": "concurrency",
      "verdict": "killed",
      "evidence": "<one line>"
    }
  ],
  "survivors": ["H3", "H4"],
  "inconclusive": [],
  "killed": ["H1", "H2", "H5"]
}
```

Then, in prose, branch on the outcome:

### 0 survivors (all killed)

Round 1 is a miss. The hypothesis set did not contain the cause. Do NOT silently regenerate.

> "All hypotheses killed. The cause is in an axis we didn't cover. Run `/god-of-debugger:debug` again — I will regenerate with the axes we already ruled out deprioritized, and must cover at least 2 axes not yet tried. Cap: 2 regeneration rounds before handing back."

Regeneration counter lives in `session.regenerations` (increment on each). After 2, halt and hand control to the user.

### Exactly 1 survivor

Likely root cause. State it plainly.

> "H_n survived. Origin: <origin>. Axis: <axis>. Evidence: <quote>. Run `/god-of-debugger:promote` to convert the experiment into a regression test before writing the fix."

### 2+ survivors

Experiments were not discriminating.

> "N hypotheses survived (H_i, H_j, ...). Design a new experiment that *distinguishes* them — their `expected_if_true` values must differ. Loop back to `/god-of-debugger:debug` with the surviving set as context."

### Flaky-repro detected mid-run

If the same hypothesis flips verdict across runner retries (runner reports `retries > 1` with differing evidence), STOP the aggregation, set `session.status = "repro_unstable"`, and tell the user: "Repro became flaky during falsification. Harden it via `/god-of-debugger:repro` before retrying."

## Rules

- Never ship a fix from this skill. The hook will block it anyway if survivor count != 1.
- Never mark `killed` without quoted evidence from the subagent.
- `inconclusive` is a first-class verdict. Includes: timeout, crash, ambiguous output, budget exhaustion. Never coerce to `killed`/`survived`.
- Subagents that crash or time out → their hypothesis is `inconclusive`, not `survived`.
- Parallel dispatch is non-negotiable. Sequential runs defeat the design.
- Preserve `origin` in every aggregation table. Users need to know when an adversarial hypothesis is the last one standing.
