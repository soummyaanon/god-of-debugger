# AGENTS.md — god-of-debugger

Instructions for coding agents (Codex CLI, Aider, and any AGENTS.md-aware host) operating in this repository.

## Project overview

This repo ships **god-of-debugger** — a falsification-first, hypothesis-driven debugging workflow. It exists as:

- A Claude Code plugin under `plugins/god-of-debugger/`.
- An open-plugins bundle under `.plugin/`.
- Host-specific surfaces: `.cursor/rules/`, `.continue/config.yaml`, this `AGENTS.md`.

Canonical pipeline prose lives in `plugins/god-of-debugger/commands/go.md`.

## Debugging workflow

When the user reports a bug, failing test, flaky behavior, stack trace, or asks "why is this broken" — run this pipeline. Do not jump straight to a fix.

### 1. Repro

Establish a deterministic failing command. **No repro → no hypotheses.** Hard rule. If the user hasn't given one, bootstrap interactively (ask for the command, the expected vs actual output, any recent changes).

### 2. Localize + hypothesize

- Grep bug symbols. Inspect stack. List recently-changed files.
- Generate **5–8 primary hypotheses** spanning ≥4 of 7 causal axes: `data`, `control-flow`, `concurrency`, `config`, `deps`, `env`, `contract`. Reject clustered sets (e.g. all "off-by-one" guesses).
- Add **2–3 adversarial hypotheses** from missed categories — actively attack your primary list.
- Each hypothesis → ONE typed experiment: `probe` | `assertion` | `test`. Pre-register the kill/survive condition before running.

### 3. Gate 1 — hypothesis review

Print a markdown table. Columns **exactly** in this order:

```
| ID | Origin | Axis | Claim (≤80 chars) | Exp | Cost |
```

Ask: `[Enter] run all · [e] edit · [s] skip →`

### 4. Run experiments

Codex CLI: no parallel subagent dispatch. Run experiments **sequentially**. Record verdict per hypothesis: `killed | survived | inconclusive`. `inconclusive` counts as `survived` for the ship-the-fix guard.

### 5. Gate 2 — survival review

Print survival table. Order: killed rows first, then survived, then inconclusive.

```
| ID | Origin | Axis | Verdict | Evidence (≤60 chars) |
```

Let `S = count(survived) + count(inconclusive)`.

### 6. Fix + promote

**Only if `S == 1`.** Write a minimal fix that removes the cause the surviving hypothesis identified. Reference the hypothesis id + evidence in the commit. Then promote the surviving experiment into a permanent regression test in the detected test dir (`tests/`, `spec/`, `__tests__/`, or `test/`).

## Hypothesis discipline rules

- Axes must span ≥4 of 7. Clustered hypotheses get rejected.
- Every hypothesis is **falsifiable**. No "maybe the network is slow sometimes" without a pre-registered probe.
- Never edit other hypotheses' state mid-run.
- All heavy work in tool calls. Orchestrator narration stays terse.

## Ship-the-fix guard (non-negotiable)

**Never propose a fix when `S != 1`.**

- `S > 1` → multiple survivors = guessing which one. Print the refusal **verbatim**:
  > `<S> hypotheses still alive. Shipping fix now = guessing which one. Run another round of falsification, or explicitly accept you're guessing?`
- `S == 0` → all killed. Regenerate hypotheses once (cap 2 rounds), weighting uncovered axes. Then hand back.
- Repro flips mid-run → halt. Harden repro before continuing. Applies even under `--yolo`.
- `--yolo` skips the interactive gates. It does **not** skip the S==1 fix-refusal rule.

## Tone

Caveman. Terse. Technical. No pleasantries. No "I'll now…". No "Let me…". Fragments OK. Exact technical terms.

## Full reference

Complete pipeline, edge cases, degenerate outcomes, and promote semantics: [`plugins/god-of-debugger/commands/go.md`](plugins/god-of-debugger/commands/go.md).
