---
description: Internal step of /god-of-debugger. Localizes bug, generates competing hypotheses across distinct causal axes, designs falsifiable experiment per hypothesis. Invoked after repro. Caveman tone.
---

# Debug — hypothesis generation + adversarial pass + experiment design

Think scientist, not guesser. Two worst failure modes:

1. Latch onto first plausible fix. Papers over real bug.
2. Polished but biased hypothesis set. Miss real category.

Adversarial pass counters #2.

## Pre-flight: repro must exist

Read `.god-of-debugger/current`. Load `.god-of-debugger/sessions/<session_id>.json`.

- No session / `repro.command` missing → STOP. Say: **"No repro. Run `/god-of-debugger:repro` first."**
- `status == "repro_unstable"` → STOP. Harden repro.
- Else proceed.

## Contract

From bug (from `$ARGUMENTS` or session):

1. **Localize** to 2–5 files/functions/modules. Subagents never get whole repo.
2. **5–8 primary hypotheses**. Cover ≥4 of 7 axes. Reject mono-axis sets (7 null-check variants ≠ 7 hypotheses).
3. **Adversary pass** after primary. Adds 2–3 hypotheses in uncovered categories. Must label `origin: adversarial`.
4. **One falsification experiment per hypothesis** (types 1–3). Output must unambiguously kill or spare.
5. **Pre-register kill/survive conditions** before execution. Runners cannot rewrite after seeing output.
6. **Write to session.hypotheses** with `axis`, `origin`, `relevant_files`, experiment spec.
7. **Emit strict JSON block** (schema below) — `run` skill parses it.
8. **No fix.** Wrong phase. `ship-the-fix` hook blocks anyway.

## 7 causal axes

Each hypothesis carries exactly one:

| Axis | Example |
|---|---|
| `data` | null/empty/malformed flows into fn that assumes otherwise |
| `control-flow` | early return, wrong branch, missing `else`, unreachable |
| `concurrency` | race, deadlock, lost update, publication w/o happens-before |
| `config` | feature flag, env var, YAML key flipped/missing |
| `deps` | lib version bump, transitive pin, API contract change |
| `env` | OS/runtime/locale diff, network, resource limit |
| `contract` | upstream/downstream API shape change, schema drift |

≥4 axes covered. Can't reach 4 → say so, ask user to accept narrower. No padding.

## Origins

| Origin | Meaning |
|---|---|
| `primary` | Main pass from localized code + repro |
| `adversarial` | Attack category bias + premise mistakes |

Peers once created. Origin tag = traceability, not weight.

## Quality bar

Good hypothesis:

- **Specific** — names fn, line, struct, race window, env var, commit. Not "something in DB layer".
- **Causal** — mechanism, not correlation. "X null because Y returns early on Z" > "X sometimes null".
- **Falsifiable** — one-sentence observation that kills it.
- **Cheap** — prefer seconds over full deploy.
- **Localized** — min file/fn surface for runner.

### Rejected on sight

- "Maybe there's a null somewhere." → no location, no predicate.
- "Cache might be wrong." → which cache, what wrong, what proves?
- 7 variants of "null check on line 42 off by one." → one axis.
- "Race condition." → no interleaving.
- "Library buggy." → lazy. Read source?
- "Works on my machine." → not hypothesis.
- Any "maybe" / "possibly" / "could be". Claims are assertions.

### Good example

> H3 (concurrency): `cart_session` map at `cart/session.go:142` mutated from TTL-expiry goroutine (`cart/expiry.go:61`) without holding `sessionMu`. Assertion that lock held on every map write trips within 10k load iterations. Kills: assertion never fires across 10k runs.

## Localization rules

Before hypotheses, narrow working set:

- 2–5 files/fns from stack traces, grep, repro output, recent git.
- Record in `session.localization`.
- Every hypothesis references subset in `relevant_files`.
- Strong adversarial hypothesis points outside set → expand deliberately, record why. Never silent fallback to whole repo.

Main token-efficiency lever. Do it first.

## Adversary pass

After primary list, invoke `adversary` agent with:

- bug summary
- repro command + hit rate
- localized file list
- primary hypotheses
- explicit: avoid categories already covered unless gap substantive

Adversary stance:

> "List above probably wrong or incomplete. What hypothesis NOT on list would senior engineer generate? Most embarrassing thing it could be?"

Adversary searches preferentially:

- config / env / deployment mistakes
- human error (wrong file, branch, stale build, image, env var)
- upstream/downstream faults outside visible code
- premise-wrong (broken test, bad report, invalid repro)

Merge adversarial into `session.hypotheses`. User must see which were adversarial.

## Experiment types

| # | Kind | Action | Killed when |
|---|---|---|---|
| 1 | log probe | Insert log at location. Run repro. | Predicted value never appears across N runs. |
| 2 | assertion | Insert temp `assert`. Run repro. | Assertion holds across N runs. |
| 3 | unit test | Write test that fails iff hypothesis holds. | Test passes. |
| 4 | git bisect *(v0.2)* | Bisect range with repro-derived check. | Range has no culprit. |
| 5 | dep pin *(v0.2)* | Down/upgrade dep. | Bug persists across versions. |
| 6 | env toggle *(v0.2)* | Flip flag/env/config. | Bug independent of toggle. |

v0.1 ships 1–3. Hypotheses needing 4–6 parked (listed, never "survive") until runner exists.

## Cheap-first ordering

Prefer cheapest discriminating experiment first:

1. env toggle / dep pin / log probe
2. assertion
3. unit test
4. git bisect

Cheap kill fast → don't escalate. Parked kinds → record cheapest viable plan anyway.

## Pre-registered falsification conditions

Every hypothesis MUST contain before any runner runs:

- `kill_condition`: exact observable outcome that falsifies.
- `survive_condition`: exact observable outcome that leaves alive.

Protocol, not decoration. Runners judge against these. Cannot rewrite after seeing output.

## Required output

After reasoning, emit **exactly one** fenced JSON block:

```json
{
  "session_id": "<from session state>",
  "bug": "<one-sentence restatement>",
  "repro": { "command": "<from session>", "hit_rate": 0.85 },
  "localization": {
    "relevant_files": ["path/to/file_a", "path/to/file_b"],
    "basis": "stack trace + grep + recent git history"
  },
  "axes_covered": ["concurrency", "config", "deps", "contract"],
  "hypotheses": [
    {
      "id": "H1",
      "origin": "primary | adversarial",
      "axis": "concurrency",
      "claim": "<specific causal mechanism with file/line>",
      "relevant_files": ["path/to/file_a", "path/to/file_b"],
      "predicts": "<obs if true>",
      "kills_it": "<obs if false>",
      "kill_condition": "<pre-registered>",
      "survive_condition": "<pre-registered>",
      "experiment": {
        "kind": "probe | assertion | test",
        "action": "<exact diff, command, or spec>",
        "expected_if_true": "<output if H1 correct>",
        "expected_if_false": "<output if H1 wrong>",
        "budget": { "wall_seconds": 120, "max_tokens": 50000, "iterations": 100 },
        "cost": "cheap | medium | expensive"
      }
    }
  ],
  "parked": [
    { "id": "H_x", "reason": "requires bisect runner (v0.2)" }
  ],
  "notes": "<optional: priors, suspicious recent commits>",
  "cost_log": {
    "planned_models": {
      "experiment_design": "sonnet",
      "verdict_extraction": "haiku"
    }
  }
}
```

Also update `session.hypotheses` with same array. Hook + `run` skill read it.

## Workflow

1. Load session. Confirm repro exists, not `repro_unstable`.
2. Localize to 2–5 files. Read them. No inference.
3. `git log --oneline -20` on relevant files. Look for suspicious commits.
4. Primary hypotheses, axis coverage ≥4. Rank by prior probability, not test cost.
5. Invoke `adversary`. Merge 2–3 non-overlapping adversarial.
6. Every kept hypothesis: pre-register `kill_condition` + `survive_condition` before finalizing experiment.
7. Design experiments from types 1–3. Cheapest can't discriminate → sharper one.
8. Write `session.localization`, `session.hypotheses`, `session.cost_log`. Emit JSON.
9. Hand off: **"Hypotheses ready. Run `/god-of-debugger:run`."**

## Anti-patterns (fireable)

- <3 hypotheses or <4 axes without flagging.
- Whole repo to subagent when localized set existed.
- Skip adversarial pass. Merge adversarial without `origin` tag.
- Hypothesis without pre-reg `kill_condition` + `survive_condition`.
- Propose fix here. Wrong skill. Wrong phase.
- "Maybe"/"possibly"/"could be" in claim.
- Experiments without distinguishing predicate ("add log and see").
- Skip session-state read. Write into wrong session.

Remember: **plugin quality = prompt quality**. Take it seriously.
