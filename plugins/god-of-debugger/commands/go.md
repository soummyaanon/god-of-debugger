---
description: Full god-of-debugger pipeline end-to-end. Caveman style. Localize, hypothesize (primary + adversarial), design experiments, run parallel, survival table, fix only if exactly 1 survives. Two inline gates. --yolo skips gates.
argument-hint: [--yolo] [--repro "<cmd>"] <bug>
---

Run full pipeline. Caveman tone: terse, no filler, fragments OK, exact technical terms. Chain skills in order. Two gates (unless `--yolo`). Never ship fix if survivors != 1.

Raw args: `$ARGUMENTS`

## Step 0 — Parse args

- `--yolo` present → `YOLO=true`, strip.
- `--repro "<cmd>"` present → extract into `REPRO_CMD`, strip.
- Rest = `BUG`.
- `BUG` empty → print usage `/god-of-debugger:go [--yolo] [--repro "<cmd>"] <bug>` and stop.

Echo parsed state as **exactly** this 3-line block. Nothing else:

```
Bug:   <BUG>
Yolo:  <YOLO>
Repro: <REPRO_CMD or (bootstrap)>
```

## Step 1 — Repro

Invoke `repro` skill.

- `REPRO_CMD` set → record into session, verify it fails.
- Else → interactive bootstrap.
- Hit rate < 30%:
  - `YOLO=true` → statistical verdicts path. Log. Continue.
  - `YOLO=false` → halt. Ask user: statistical or harden.
- No repro → no hypotheses. Hard rule.

## Step 2 — Localize + Debug

Invoke `debug` skill.

1. Localize first: stack + recent files + grep `BUG` symbols. Write `localization.relevant_files`.
2. Generate 5–8 **primary** hypotheses. Axes ≥4 of 7 (data, control-flow, concurrency, config, deps, env, contract). Reject clustered sets.
3. Invoke `adversary` subagent. Gets primary list. Returns 2–3 adversarial hypotheses for missed categories.
4. Each hypothesis: one typed experiment (probe | assertion | test). Pre-register kill/survive condition.
5. Write session state.

## Gate 1 — hypothesis review

Skip if `YOLO=true`. Print one line: `--yolo: running <N> experiments in parallel.`

If `YOLO=false`: print markdown table (must render cleanly in CC terminal). Columns **exactly** in this order:

```
| ID | Origin | Axis | Claim (≤80 chars) | Exp | Cost |
```

- `Origin`: `prim` or `adv`
- `Exp`: `probe` | `assert` | `test` | `bisect`
- `Cost`: `cheap` | `med` | `exp`
- Row count ≤10. Truncate claim with `…` if >80 chars.

After table, print **exactly** one prompt line:

```
<N> hypotheses (<P> prim, <A> adv). [Enter] run all · [e] edit · [s] skip →
```

Wait for user. Match case-insensitive:

- empty/`enter`/`y`/`yes`/`run`/`approve` → Step 3.
- `e`/`edit` → ask which rows drop/rewrite/re-budget. Apply. Re-print table. Re-prompt.
- `s`/`skip` → Step 3.
- Anything else → freeform edit. Apply. Re-print. Re-prompt.

## Step 3 — Run

Invoke `run` skill. Dispatch one `hypothesis-runner` per hypothesis **in parallel** (single message, multiple Task calls). Each subagent gets only: `{bug_summary, repro_command, hypothesis, repo_path, budget}` + narrowed `hypothesis.relevant_files`. Never whole session. Never other hypotheses.

Aggregate verdicts: `killed` | `survived` | `inconclusive`. `inconclusive` counts as `survived` for fix-refusal.

Degenerate outcomes (handle inline):

- **All killed** → regenerate hypotheses once, weight uncovered axes. Cap 2 rounds. Then hand back.
- **Zero killed** → offer tighten experiments (narrower asserts, longer runs) before more hypotheses.
- **Repro flips mid-run** → halt. Mark `repro_unstable`. Send to repro hardening. Applies even under `--yolo`.

## Gate 2 — survival review

Print survival table. Columns **exactly**:

```
| ID | Origin | Axis | Verdict | Evidence (≤60 chars) |
```

Order: killed rows first, then survived, then inconclusive. Truncate evidence.

`S` = count of `survived` + `inconclusive`.

If `YOLO=false`, print **exactly** one line:

```
<S> survived. [Enter] details · [f] propose fix · [m] more experiments →
```

Wait for user:

- empty/`enter` → expand each survivor: full evidence, artifact path, what would falsify next. Re-prompt same gate.
- `f`/`fix`/`propose`:
  - `S == 1` → Step 4.
  - `S != 1` → print refusal **verbatim**: *"<S> hypotheses still alive. Shipping fix now = guessing which one. Run another round of falsification, or explicitly accept you're guessing?"* Re-prompt. No production code written.
- `m`/`more` → design narrower second round against survivors. Re-run Step 3. Re-enter Gate 2.
- Anything else → freeform. Apply. Re-prompt.

If `YOLO=true`:

- `S == 1` → print `--yolo: 1 hypothesis survived. Proposing fix.` Step 4.
- `S != 1` → print survival table, print refusal, STOP. `--yolo` skips gates, **not** fix-refusal.

## Step 4 — Propose fix (only if `S == 1`)

1. Minimal fix removing cause the survivor identified. Reference hypothesis id + evidence.
2. Write fix via Edit/Write. PreToolUse hook allows because `S == 1` in session. If blocked, re-check state.
3. Offer run test suite. Under `--yolo` run auto if detected: `npm test` | `pytest` | `cargo test` | `go test ./...` | `bundle exec rspec`.

## Step 5 — Promote (auto, silent)

Invoke `promote` in **auto mode**:

1. Detect test dir: `tests/` | `spec/` | `__tests__/` | `test/`.
2. Surviving experiments that failed pre-fix and pass post-fix → permanent regression test in detected dir.
3. Revert any un-promoted `probe.diff` under `.god-of-debugger/experiments/*/`. Clean tree except new tests.
4. Append `God-Of-Debugger-Session: <id>` trailer to fix commit. `git commit --amend --no-edit` only if commit authored this session + not pushed. Else add to next commit.
5. `session.status = "closed"`.

No prompts. Output **exactly** one line:

```
Added <N> regression tests to <detected-dir>/.
```

`N == 0`:

```
No regression tests added — experiment did not flip post-fix. Investigate before shipping.
```

Mark session `regressed_promotion_failed`.

## Non-negotiables

- Gates exist to kill confirmation bias. `--yolo` removes gates, **not** §5.4 fix-refusal. Never propose fix with `S != 1`.
- PreToolUse hook = backstop. Blocked edit → fix session state, not the hook.
- All heavy work in subagents (hypothesis-runner × N, adversary × 1). Orchestrator stays light.
- Everything at gates fits one screen. One-line prompts. Concise tables. No wall-of-text unless user asks for details.
- Caveman tone throughout. No pleasantries. No "I'll now...". No "Let me...". Just do.
