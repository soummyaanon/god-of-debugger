---
description: Run the full god-of-debugger pipeline end-to-end in a single command. Localize, generate hypotheses (primary + adversarial), design experiments, run in parallel, show survival table, propose fix only if exactly one hypothesis survives. Two inline gates (Enter to keep going). Pass --yolo to skip gates.
argument-hint: [--yolo] <bug description or path to bug report>
---

Run the full god-of-debugger pipeline for the bug below, as a single flow. You are the orchestrator — you chain the skills in order, pause at the two inline gates (unless `--yolo`), and enforce the fix-refusal rule. Do not split this into multiple user invocations.

Raw arguments: `$ARGUMENTS`

## Step 0 — Parse arguments

Parse `$ARGUMENTS` as follows:

- If the arguments start with `--yolo` (with or without surrounding whitespace), set `YOLO = true` and strip the flag. Otherwise `YOLO = false`.
- Also accept `--repro "<command>"` anywhere in the arguments. If present, extract the command into `REPRO_CMD` and strip the flag from the bug text.
- Everything remaining is the bug description/path — call it `BUG`.
- If `BUG` is empty after stripping flags, tell the user the usage (`/god-of-debugger [--yolo] [--repro "<cmd>"] <bug>`) and stop.

Echo the parsed values back in one line so the user can see what you understood:

```
Bug: <BUG>
Yolo: <YOLO>
Repro: <REPRO_CMD or "(bootstrap)">
```

## Step 1 — Repro

Invoke the `repro` skill.

- If `REPRO_CMD` was supplied, record it directly into `.god-of-debugger/sessions/<id>.json` and verify it fails on the bug.
- Otherwise run the interactive bootstrap to construct a minimum viable repro.
- Measure hit rate. If hit rate < 30% (per PRD §2.5):
  - If `YOLO = true`: default to statistical verdicts (path a). Log the choice, continue.
  - If `YOLO = false`: halt and ask the user to choose statistical verdicts vs harden repro.
- Do NOT proceed to hypothesis generation without a recorded repro.

## Step 2 — Localize + Debug

Invoke the `debug` skill.

1. Localize the bug first (stack trace + recently touched files + grep for symbols in `BUG`). Write `localization.relevant_files` into session state. This narrows the code each subagent reads.
2. Generate 5–8 **primary** hypotheses spanning ≥4 of: data, control-flow, concurrency, config/env, dependency, contract/boundary, resource/quota. Reject clustered sets (seven variants of one null-check is one hypothesis).
3. Invoke the `adversary` subagent with the primary list. It returns 2–3 additional hypotheses labeled `origin: adversarial`, focused on categories the primary pass missed (config, env, deployment, human error, upstream/downstream, premise-wrong).
4. For each hypothesis, design a typed experiment (v0.1: log probe, assertion, or unit test). Pre-register the kill/survive conditions before execution.
5. Write everything to session state.

## Gate 1 — hypothesis review (skipped if `YOLO`)

If `YOLO = false`:

Present the hypothesis table (columns: id, origin, axis, claim, experiment type, est. cost) and then print exactly one line:

```
Found <N> hypotheses (<P> primary, <A> adversarial). [Enter] run all · [e] edit · [s] skip review →
```

Wait for the user's response. Treat input case-insensitively:

- Empty message / `enter` / `y` / `yes` / `run` / `approve` → proceed to Step 3.
- `e` / `edit` → ask the user which rows to drop, rewrite, or re-budget. Apply edits to session state, then re-print the table and re-prompt the gate.
- `s` / `skip` → proceed to Step 3 (same as Enter; offered for muscle memory).
- Anything else → treat as freeform edit instructions, apply to session state, re-print the table and re-prompt.

If `YOLO = true`: skip the gate entirely. Print one line: `--yolo: running <N> experiments in parallel.`

## Step 3 — Run

Invoke the `run` skill. Dispatch one `hypothesis-runner` subagent per hypothesis in parallel. Each subagent receives only `{ bug_summary, repro_command, hypothesis, repo_path, budget }` and the narrowed `hypothesis.relevant_files` — never the whole session or other hypotheses.

Aggregate structured verdicts (`killed` | `survived` | `inconclusive`) into the survival table. `inconclusive` counts as `survived` for the fix-refusal gate.

Handle degenerate outcomes (PRD §2.6) inline:

- **All killed** → re-prompt hypothesis generation once, weighted toward uncovered axes. Cap at 2 rounds total, then hand back to the user with the evidence.
- **Zero killed** (all survived/inconclusive) → offer to tighten experiments (narrower assertions, longer runs, finer probes) before generating more hypotheses.
- **Repro flaky mid-session** (same experiment flips verdict across retries) → halt, mark session `repro_unstable`, send user to repro hardening. This halt applies even under `--yolo`.

## Gate 2 — survival review (skipped if `YOLO`)

Print the survival table (killed first, then survived, then inconclusive, each with a one-line evidence summary).

Let `S` = number of `survived` + `inconclusive`.

If `YOLO = false`:

Print exactly one line:

```
<S> survived. [Enter] see details · [f] propose fix · [m] more experiments →
```

Wait for the user's response:

- Empty message / `enter` → expand each survivor: full evidence, experiment artifact path, what would falsify it next. Re-prompt the same gate.
- `f` / `fix` / `propose` →
  - If `S == 1`: proceed to Step 4 (propose fix).
  - If `S != 1`: print the refusal from PRD §5.4 (quote it verbatim: *"<S> hypotheses are still alive. Shipping a fix now means guessing which one it is. Want to run another round of falsification, or explicitly accept that you're guessing?"*) and re-prompt this gate. Do not write any production code.
- `m` / `more` → design a second round of narrower experiments against the survivors (same typed experiments, tighter conditions). Re-run (Step 3). Re-enter Gate 2.
- Anything else → treat as freeform instructions, apply, re-prompt.

If `YOLO = true`:

- If `S == 1`: print `--yolo: exactly 1 hypothesis survived. Proposing fix.` and proceed to Step 4.
- If `S != 1`: print the survival table, print the PRD §5.4 refusal, and STOP. `--yolo` skips gates, it does not bypass correctness. The fix-refusal is a correctness guarantee, not a gate.

## Step 4 — Propose fix (only reachable when `S == 1`)

With exactly one surviving hypothesis:

1. Propose the minimal fix that removes the cause the surviving hypothesis identified. Reference the hypothesis id and the evidence that pinned it.
2. Write the fix via Edit/Write tools. The PreToolUse hook will allow this because `S == 1` in session state; if the hook blocks, re-read session state and ensure survivors are correctly recorded before retrying.
3. Offer to run the user's test suite to confirm nothing else regressed. Under `--yolo`, run it automatically if a standard test command is detected (`npm test`, `pytest`, `cargo test`, `go test ./...`, `bundle exec rspec`).

## Step 5 — Promote (automatic, silent)

After the fix is written and accepted, automatically invoke the `promote` skill in **auto mode**:

1. Detect the repo's test directory and framework (PRD §5.1.3): `tests/`, `spec/`, `__tests__/`, `test/` — whichever exists.
2. For each surviving experiment that (a) failed without the fix and (b) passes with it, convert the artifact into a permanent regression test in the detected directory.
3. Revert any `probe.diff` left under `.god-of-debugger/experiments/*/` that has not been promoted. Leave the tree clean except for the new regression tests.
4. Append a `God-Of-Debugger-Session: <session_id>` trailer to the fix commit (offer `git commit --amend --no-edit` only if the commit was authored in this session and has not been pushed; otherwise, add it to the next commit).
5. Mark `session.status = "closed"`.

Do not prompt the user during promotion. Report the result as **exactly one line**:

```
Added <N> regression tests to <detected-dir>/.
```

If `N == 0` (no experiment flipped correctly, or no survivor was test-promotable), print:

```
No regression tests added — surviving experiment did not flip post-fix. Investigate before shipping.
```

…and mark the session `regressed_promotion_failed` instead of `closed`.

## Non-negotiables

- The two gates exist because confirmation bias is the failure mode this plugin exists to prevent. `--yolo` removes the gates; it does **not** remove the §5.4 fix-refusal. Never propose a fix with `S != 1`, yolo or not.
- The PreToolUse hook is your backstop — do not try to edit around it. If it blocks an edit, read session state and fix the state, do not fight the hook.
- All long-running work happens in subagents (hypothesis-runner × N, adversary × 1) so the orchestrator stays context-light.
- Everything the user sees at gates must fit in one screen. One-line prompts, concise tables, no wall-of-text explanations unless the user asks for details.
