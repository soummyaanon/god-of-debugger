---
description: Hypothesis-driven debugging. Use when the user reports a bug, a failing test, unexpected output, a crash, a regression, or says "debug this", "why is this broken", "figure out what's wrong". Generates multiple competing hypotheses spanning distinct causal axes and designs falsifiable experiments for each before touching code.
---

# Debug — Hypothesis Generation & Experiment Design

You are not here to guess. You are here to **think like a scientist**.

The single most expensive failure mode in debugging is latching onto the first plausible explanation and "fixing" it. That fix often papers over the real bug, or worse, introduces a new one. This skill exists to prevent that.

## Pre-flight: repro must exist

Before generating hypotheses, read `.god-of-debugger/current` and load the session file at `.god-of-debugger/sessions/<session_id>.json`.

- If no session exists, or `session.repro.command` is missing, STOP and tell the user: **"No repro in session state. Run `/god-of-debugger:repro` first."**
- If `session.status == "repro_unstable"`, STOP and tell the user to harden the repro.
- Otherwise, proceed with the loaded repro.

## The contract

Given a bug report (from `$ARGUMENTS` or session state), you MUST:

1. **Generate 5–8 competing hypotheses**, spanning at least **4 of the 7 causal axes** below. Mono-axis hypothesis sets are rejected — a set of 7 null-check variants is not 7 hypotheses.
2. **For each hypothesis, design ONE falsification experiment** from the allowed types (see §Experiment types). The experiment's output must unambiguously kill or spare the hypothesis.
3. **Write hypotheses into session state** (`session.hypotheses`), each tagged with its axis and experiment spec.
4. **Emit the strict JSON block** the `run` skill consumes.
5. **Do NOT propose a fix.** Fixes come after exactly one hypothesis survives. The `ship-the-fix` hook will block you if you try.

## The 7 causal axes

Every hypothesis must carry exactly one axis tag:

| Axis | Examples |
|---|---|
| `data` | null/zero/empty/malformed value flows through a function that assumes otherwise |
| `control-flow` | early return, wrong branch, missing `else`, unreachable code |
| `concurrency` | race, deadlock, lost update, publication without happens-before |
| `config` | feature flag, env var, YAML/TOML key flipped or missing |
| `deps` | library version bump, transitive pin, API contract change |
| `env` | OS/runtime/locale difference, network topology, resource limit |
| `contract` | upstream/downstream API returning an unexpected shape, schema drift |

A valid hypothesis set covers at least 4 of these. If you can't reach 4, say so explicitly and ask the user to accept a narrower set — do not fabricate axes to pad the count.

## Hypothesis quality bar

A good hypothesis is:

- **Specific** — names a function, line range, data structure, race window, env var, or commit. Not "something in the database layer".
- **Causal** — describes a *mechanism*, not a correlation. "X is null because Y returns early on Z" beats "X is sometimes null".
- **Falsifiable** — you can describe, in one sentence, the observation that would kill it.
- **Cheap to test** — prefer experiments that run in seconds over ones that need a full deploy.

### Anti-examples — rejected on sight

- "Maybe there's a null somewhere." → no location, no predicate, no experiment.
- "The cache might be wrong." → which cache, what wrong, what would prove it?
- Seven variants of "the null check on line 42 is off by one." → one axis, not seven hypotheses.
- "It's a race condition." → asserted without a concrete interleaving.
- "The library is buggy." → lazy. Have you read the relevant source?
- "Works on my machine." → not a hypothesis.
- Any claim containing "maybe", "possibly", "could be". Claims are assertions. You're wrong until the experiment proves you right.

### Good hypothesis, for contrast

> H3 (concurrency): `cart_session` map at `cart/session.go:142` is mutated from the TTL-expiry goroutine (`cart/expiry.go:61`) without holding `sessionMu`. An assertion that the lock is held on every map write will trip within 10k load iterations. Kills: assertion never fires across 10k runs.

## Experiment types (MVP: types 1–3)

| Type | Action | Killed when |
|---|---|---|
| 1. log probe | Insert a log line at a specific location. Run repro. | Predicted value never appears across N runs. |
| 2. assertion | Insert a temporary `assert`. Run repro. | Assertion holds across N runs. |
| 3. unit test | Write a test that fails iff the hypothesis holds. | The test passes. |
| 4. git bisect *(v0.2)* | Bisect a commit range with a repro-derived check. | Range contains no culprit commit. |
| 5. dep pin *(v0.2)* | Down/upgrade a specific dependency. | Bug persists across pinned versions. |
| 6. env toggle *(v0.2)* | Flip a flag/env/config. | Bug is independent of the toggle. |

v0.1 ships types 1–3. Hypotheses requiring types 4–6 are parked (listed, never "survive") until the corresponding runner exists.

## Required output

After reasoning, emit exactly one fenced JSON block:

```json
{
  "session_id": "<from session state>",
  "bug": "<one-sentence restatement>",
  "repro": { "command": "<from session state>", "hit_rate": 0.85 },
  "axes_covered": ["concurrency", "config", "deps", "contract"],
  "hypotheses": [
    {
      "id": "H1",
      "axis": "concurrency",
      "claim": "<specific causal mechanism with file/line>",
      "predicts": "<observation that would be true if this holds>",
      "kills_it": "<observation that would falsify it>",
      "experiment": {
        "kind": "probe | assertion | test",
        "action": "<exact diff, command, or spec>",
        "expected_if_true": "<what output looks like if H1 is correct>",
        "expected_if_false": "<what it looks like if H1 is wrong>",
        "budget": { "wall_seconds": 120, "max_tokens": 50000, "iterations": 100 },
        "cost": "cheap | medium | expensive"
      }
    }
  ],
  "parked": [
    { "id": "H_x", "reason": "requires bisect runner (v0.2)" }
  ],
  "notes": "<optional: priors, suspicious recent commits>"
}
```

Also update `session.hypotheses` with the same array so the hook and `run` skill can read it.

## Workflow

1. Load session state. Confirm repro exists and is not `repro_unstable`.
2. Read the code paths involved — actually read them, don't infer.
3. Check recent git history (`git log --oneline -20` on relevant files) for suspicious changes.
4. Generate hypotheses with axis coverage ≥4. Rank by prior probability, not by test cost.
5. Design experiments from types 1–3. If the cheapest experiment can't distinguish two hypotheses, design a sharper one.
6. Write the hypotheses into session state and emit the JSON block.
7. Hand off: **"Hypotheses ready. Run `/god-of-debugger:run` to execute experiments in parallel."**

## Anti-patterns that get you fired

- Emitting <3 hypotheses, or covering <4 axes without flagging it.
- Proposing the fix in this skill. Wrong skill. Wrong phase.
- "Maybe", "possibly", "could be" in a claim.
- Experiments without a distinguishing predicate ("add a log and see what it says").
- Skipping the session-state read, or writing into a different session.

Remember: **the quality of this plugin is the quality of this prompt**. Take it seriously.
