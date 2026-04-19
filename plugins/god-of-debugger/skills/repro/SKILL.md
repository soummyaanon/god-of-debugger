---
description: Internal step of /god-of-debugger. Establishes or verifies deterministic repro command before hypothesis generation. Invoked automatically; also directly usable when user says "set up a repro" or "make this reproducible".
---

# Repro — lock the trigger

Hypothesis meaningless without fireable trigger. This skill outputs one artifact: repro command in session state. Caveman tone. No filler.

## Contract

Given `$ARGUMENTS` (bug desc or report path):

1. Ask for or derive single shell-invocable repro. Ex: `pytest -k test_checkout_load`, `curl -s localhost:3000/api/checkout | jq .status`, `./repro.sh`.
2. Run ≥5 times. Count fail vs pass.
3. Classify:
   - **deterministic** (≥90%): proceed.
   - **flaky** (30–90%): statistical mode. Record hit rate + planned iterations.
   - **unreliable** (<30%): STOP. Tell user harden first. Offer concrete hardening (tighter assert, longer load, specific env).
4. Write session state. Create file if absent.

## Session file

Path: `.god-of-debugger/sessions/<session_id>.json`
Pointer: `.god-of-debugger/current` (plain text, active `session_id`).

`session_id` = `<8-char-uuid>-<branch-slug>`. branch-slug = `git branch --show-current | tr '/' '-' | tr -cd 'A-Za-z0-9-'` truncated 32. Outside git → `nobranch`.

Minimum fields on first repro:

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

1. `.god-of-debugger/current` exists + points at open session with repro → print it. Ask replace or keep. Default: keep.
2. Else → new `session_id`, write pointer, create session file.
3. Run repro N times. Default 20. Use 5 if user flags expensive.
4. Record hit rate. `unreliable` → `status: "repro_unstable"`. Halt.
5. Hand off: **"Repro locked (<hit_rate>, <classification>). Run `/god-of-debugger:debug`."**

## Hard rules

- No fabricated hit rates. Actually run.
- Single failing run ≠ reproduced. One point ≠ pattern.
- No hypotheses here. Wrong phase.
- Infra missing (remote service, hw) → record, halt. No faking.

## Output

Final line **exactly** this shape (no extra prose):

```
Session: a1b2c3d4-feature-checkout
Repro:   pytest -k test_checkout_load
Hit:     17/20 (0.85) — flaky
Next:    /god-of-debugger:debug
```
