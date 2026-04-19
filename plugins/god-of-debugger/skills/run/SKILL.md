---
description: Internal step of /god-of-debugger. Dispatches one hypothesis-runner subagent per hypothesis in parallel. Aggregates verdicts into survival table. Invoked after hypotheses written to session.
---

# Run — parallel experiment execution

Orchestrate experiments from `debug`. One subagent per hypothesis (`hypothesis-runner`, or `bisect-runner` for bisect). Run **parallel**. Strict verdict back.

Also maintain session `cost_log`. Record what happened.

## Inputs

1. `.god-of-debugger/current` → active `session_id`.
2. `.god-of-debugger/sessions/<session_id>.json` → bug, repro, localization, hypotheses.

Missing either → STOP. Tell user run `/god-of-debugger:repro` + `/god-of-debugger:debug` first.

## Pre-flight

- Session has ≥2 hypotheses with `experiment` specs.
- `status == "open"` (not `closed`, not `repro_unstable`).
- Skip `session.parked` — need runners not in v0.1.

## Orchestration

1. Every non-parked hypothesis → dispatch one subagent. **Single message. Multiple Task tool calls. Parallel.**
   - `experiment.kind == "bisect"` → `bisect-runner`
   - else → `hypothesis-runner`
2. Pass each subagent only: `{ session_id, bug_summary, repro: {command, hit_rate}, hypothesis, budget, repo_path }`. Never other hypotheses. Never prior verdicts. Isolation = point.
3. Wait all verdicts. No early exit.
4. Verify each subagent wrote `.god-of-debugger/experiments/<Hn>/preregistered.json`, `verdict.json`, `probe.diff` (if edit), `run.log`. Missing → mark `inconclusive`, `evidence: "runner returned incomplete artifacts"`.
5. Update `session.hypotheses[i]` with `verdict`, `evidence`, `artifact_path`, `budget_consumed`, `retries`, `confidence`, `falsification_check`.
6. Append per-run usage to `session.cost_log.runs[]` with hypothesis id, origin, model, tokens if available.
7. Write survivor set to `session.survivors`. Touch `session.updated_at`.

## Output — two parts

### Part 1 — strict JSON (for pipeline)

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

### Part 2 — markdown table (for user, in CC terminal)

Render **exactly** this shape. Columns in order:

```
| ID | Origin | Axis | Verdict | Evidence (≤60 chars) |
```

- `Origin`: `prim` | `adv`
- `Verdict`: `killed` | `survived` | `inconc`
- Order rows: killed first, then survived, then inconclusive.
- Truncate evidence with `…` if >60 chars.

Then prose, branch on outcome:

### 0 survivors (all killed)

Round 1 missed. Don't silently regenerate.

> "All killed. Cause in axis not covered. Run `/god-of-debugger:debug` again. Regenerate with ruled-out axes deprioritized. Must cover ≥2 axes not yet tried. Cap: 2 regen rounds."

Counter in `session.regenerations` (increment each). After 2, halt, hand to user.

### Exactly 1 survivor

Likely root cause. State plainly.

> "H_n survived. Origin: <origin>. Axis: <axis>. Evidence: <quote>. Run `/god-of-debugger:promote` to convert experiment to regression test before fix."

### 2+ survivors

Experiments not discriminating.

> "N survived (H_i, H_j, ...). Design experiment that **distinguishes** them — their `expected_if_true` must differ. Loop back to `/god-of-debugger:debug` with survivor set as context."

### Flaky repro mid-run

Same hypothesis flips verdict across retries (`retries > 1` with differing evidence) → STOP aggregation. `session.status = "repro_unstable"`. Tell user: "Repro went flaky during falsification. Harden via `/god-of-debugger:repro` before retry."

## Rules

- Never ship fix here. Hook blocks anyway if survivors != 1.
- Never `killed` without quoted evidence from subagent.
- `inconclusive` is first-class. Includes: timeout, crash, ambiguous output, budget exhaust. Never coerce to `killed`/`survived`.
- Subagent crashes / times out → `inconclusive`, not `survived`.
- Parallel dispatch non-negotiable. Sequential defeats design.
- Preserve `origin` in every table. Users must see when adversarial is last standing.
