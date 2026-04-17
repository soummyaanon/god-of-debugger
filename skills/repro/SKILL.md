---
description: Establish or verify a deterministic reproduction command for a bug before hypothesis generation. Use when the user says "set up a repro", "make this reproducible", "/god-of-debugger:repro", or when /god-of-debugger:debug halts because no repro exists in session state.
---

# Repro — Bootstrap the Reproduction Contract

A hypothesis is only meaningful relative to a trigger you can fire. This skill produces one artifact: a repro command, recorded in session state, that reliably surfaces the bug.

## The contract

Given `$ARGUMENTS` (bug description or pointer to report), you MUST:

1. Ask for (or derive) a single shell-invocable repro command. Examples: `pytest -k test_checkout_load`, `curl -s localhost:3000/api/checkout | jq .status`, `./repro.sh`.
2. Run it at least 5 times. Count failures vs successes.
3. Classify:
   - **deterministic** (≥90% hit rate): proceed.
   - **flaky** (30–90%): statistical mode — record hit rate and planned repetition count for experiments.
   - **unreliable** (<30%): STOP. Tell the user the repro must be hardened before falsification is worth the tokens. Offer concrete hardening suggestions (tighter assertion, longer load, specific env).
4. Write the result into session state (see schema below). Create the session file if absent.

## Session file

Path: `.god-of-debugger/sessions/<session_id>.json`
Pointer: `.god-of-debugger/current` (plain text file containing the active session_id).

`session_id` format: `<8-char-uuid>-<branch-slug>` where branch-slug is `git branch --show-current | tr '/' '-' | tr -cd 'A-Za-z0-9-'` truncated to 32 chars. Fall back to `nobranch` outside a git repo.

Minimum fields to write on first `:repro` run:

```json
{
  "session_id": "a1b2c3d4-feature-checkout",
  "branch": "feature/checkout",
  "bug": "<one-sentence restatement>",
  "repro": {
    "command": "pytest -k test_checkout_load",
    "hit_rate": 0.85,
    "runs": 20,
    "classification": "flaky",
    "notes": "fails only after >50 iterations"
  },
  "hypotheses": [],
  "experiments_dir": ".god-of-debugger/experiments/",
  "status": "open",
  "created_at": "<ISO-8601>",
  "closed_at": null
}
```

## Workflow

1. If `.god-of-debugger/current` already points at an open session with a repro, print it and ask whether to replace or keep. Default: keep.
2. Otherwise, generate a fresh `session_id`, write `.god-of-debugger/current`, create the session file.
3. Run the repro N times (default 20; 5 for expensive commands the user flags).
4. Record hit rate. If classification is `unreliable`, mark session `status: "repro_unstable"` and halt.
5. Hand off: **"Repro locked in (<hit_rate>, <classification>). Run `/god-of-debugger:debug` to generate hypotheses."**

## Hard rules

- Do not fabricate a hit rate. Actually run the command.
- Do not mark a bug "reproduced" on the basis of a single failing run. One data point is not a pattern.
- Do not write hypotheses in this skill. Wrong phase.
- If the repro needs infra the current machine lacks (remote service, specific hardware), record that and halt — do not fake it.

## Output discipline

Final line printed to the user must include the session id, command, hit rate, and classification. Example:

```
Session: a1b2c3d4-feature-checkout
Repro:   pytest -k test_checkout_load
Hit:     17/20 (0.85) — flaky
Next:    /god-of-debugger:debug
```
