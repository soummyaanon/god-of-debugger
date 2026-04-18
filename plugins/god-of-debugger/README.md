# god-of-debugger

**Debug by disproving.** A Claude Code plugin that turns a bug report into a falsification protocol — hypotheses, parallel experiments, and a fix only when exactly one hypothesis survives.

> One command. One paste. Enter to keep going.

**Website:** [godofdebugger.bixai.dev](https://godofdebugger.bixai.dev/) · **Repo:** [github.com/soummyaanon/god-of-debugger](https://github.com/soummyaanon/god-of-debugger)

---

## Why

The default debugging loop — yours, mine, Claude's — is confirmation-biased guessing:

```
read stack trace → form one hypothesis → scan for confirming evidence → ship patch
```

The bug "goes away," nobody can prove the cause was the cause, and three weeks later it comes back.

Senior engineers debug by **elimination**. Enumerate what could be wrong, design the cheapest experiment that rules each one out, let what survives be the cause. `god-of-debugger` makes Claude do that, in parallel, behind one slash command.

---

## Install

```bash
claude plugin marketplace add soummyaanon/god-of-debugger
claude plugin install god-of-debugger@god-of-debugger-marketplace
```

Or from inside a Claude Code session:

```
/plugin marketplace add soummyaanon/god-of-debugger
/plugin install god-of-debugger@god-of-debugger-marketplace
```

---

## Usage

One command. That's the whole surface.

```bash
/god-of-debugger <paste your bug here>
```

End-to-end, this runs:

```
1. establish repro        →  a deterministic way to trigger the bug
2. localize               →  narrow to the files that matter
3. generate hypotheses    →  5–8 primary + 2–3 adversarial
4. design experiments     →  one falsification test per hypothesis
5. run in parallel        →  one subagent per hypothesis
6. survival table         →  killed / survived / inconclusive
7. propose fix            →  ONLY if exactly one survives
8. promote to regression  →  silently, one line of output
```

### Flags

| Flag | Effect |
|---|---|
| _(none)_ | Full pipeline with two inline gates. Enter at either gate keeps going. |
| `--yolo` | Skip both gates. Fix-refusal still applies. |
| `--repro "<cmd>"` | Skip repro bootstrap. Use `<cmd>` directly. |

Flags combine: `--yolo --repro "..."` is full autopilot.

### The two gates

```
Gate 1 — after hypotheses:   [Enter] run all  ·  [e] edit  ·  [s] skip
Gate 2 — after survival:     [Enter] details  ·  [f] fix   ·  [m] more
```

Default = Enter = keep going. Power users intervene with one keypress. `--yolo` removes both gates but **cannot** bypass the fix-refusal — if more than one hypothesis survives, no fix ships. Correctness is not a gate.

---

## Walkthrough: "My checkout API throws 500s under load. Sometimes."

```bash
/god-of-debugger "intermittent 500s on /api/checkout under load"
```

**Repro.** The plugin detects your test framework, proposes a repro command, and locks it in at the measured hit rate.

```
→ Detected pytest. Suggested: pytest -k test_checkout_load
→ 18/20 iterations failed (90% hit rate). Locked in.
```

**Localize + hypothesize.** Stack trace + recent git log narrow the file surface. Two subagent passes generate primary and adversarial hypotheses across distinct causal axes (concurrency, resource, contract, config, deploy, …).

**Gate 1 — review the plan.**

```
┌────┬───────┬──────────────┬──────────────────────────────┬───────────────┐
│ ID │ ORIGIN│ AXIS         │ CLAIM                        │ EXPERIMENT    │
├────┼───────┼──────────────┼──────────────────────────────┼───────────────┤
│ H1 │ prim  │ concurrency  │ Race on cart_session map     │ assertion     │
│ H2 │ prim  │ resource     │ DB connection pool exhausted │ log probe     │
│ H3 │ prim  │ upstream     │ Payment API timeout cascade  │ mock + latency│
│ H4 │ prim  │ data         │ Stale Redis TTL              │ unit test     │
│ H5 │ prim  │ contract     │ Null inventory deser         │ unit test     │
│ H6 │ prim  │ dependency   │ serde bump regression        │ bisect (v0.2) │
│ H7 │ prim  │ control-flow │ Retry amplifies failure      │ assertion     │
│ H8 │ adv   │ config/env   │ Sticky-session misconfig     │ env toggle    │
│ H9 │ adv   │ deploy       │ Wrong container memory limit │ env toggle    │
└────┴───────┴──────────────┴──────────────────────────────┴───────────────┘

Found 9 hypotheses (7 primary, 2 adversarial).
[Enter] run all  ·  [e] edit  ·  [s] skip review  →
```

**Parallel execution.** One subagent per hypothesis, context-isolated — each sees only its own hypothesis, not the others.

```
6 killed · 2 survived · 1 inconclusive
```

**Gate 2 — survival table.**

```
3 survived (H3, H4, H6 — inconclusive counts as alive).
[Enter] see details  ·  [f] propose fix  ·  [m] more experiments  →
```

If you type `f` while more than one survives, you get:

```
3 hypotheses are still alive. Shipping a fix now means guessing which one
it is. Want to run another round of falsification, or explicitly accept
that you're guessing?
```

A Claude Code hook also blocks `Write`/`Edit` to production files while survivors ≠ 1. Even `--yolo` can't cheat.

**Converge.** Typing `m` runs a second, tighter round against the three survivors. Most sessions converge here to exactly one.

**Fix + silent promote.** Once one survives, the fix ships with the minimal patch, the repro re-runs to verify, and the surviving experiment is promoted to a permanent regression test.

```
Added 1 regression test to tests/test_checkout_session_ttl.py.
Session closed. Fix commit tagged: God-Of-Debugger-Session: a1b2c3-feature-checkout
```

Total elapsed: ~4 minutes.

---

## When to reach for this

**Use it when:**

- A bug has been "fixed" before and came back.
- A flaky test where the last three theories didn't pan out.
- A production incident where the obvious cause feels too obvious.
- A legacy system where nobody trusts their mental model anymore.

**Don't use it for:**

- Typos, missing imports, or anything a linter catches.
- Bugs where the fix is already obvious and cheap to verify.

This plugin is **slower per bug on purpose**. It trades per-iteration speed for per-fix permanence. On trivial bugs, the friction is the point of failure. On real bugs, it's the point.

---

## Under the hood

```
┌────────────────────────────────────────────────────────────────────────┐
│                    /god-of-debugger <bug>                              │
└────────────────────────────┬───────────────────────────────────────────┘
                             │
         ┌───────────────────┼───────────────────┐
         ▼                   ▼                   ▼
    skills/repro       skills/debug         skills/run
    (bootstrap)        (localize +          (fan-out)
                       hypothesize +
                       experiment design)
                             │                   │
                             │      ┌────────────┴─────────────┐
                             │      ▼             ▼            ▼
                             │  hypothesis-  hypothesis-  hypothesis-
                             │   runner       runner       runner
                             │     (H1)         (H2)        ... (HN)
                             │      │             │            │
                             │      └─────────────┼────────────┘
                             │                    ▼
                             │           survival table
                             │                    │
                             └──> adversary ──────┘
                                                  │
                          ┌───────────────────────┘
                          ▼
                  skills/promote   (auto, only if survivors == 1)
```

- **Subagents isolate context.** Each `hypothesis-runner` sees only the bug, the repro, its one hypothesis, and narrowed `relevant_files`. It never sees other hypotheses or their verdicts.
- **The adversary** is a separate subagent told to find the category gap the primary pass missed (config, env, deploy, human error, "premise is wrong"). It exists to counter the model's code-bias.
- **The hook** (`PostToolUse` on `Write|Edit`) reads session state and blocks production-file edits while survivor count ≠ 1.
- **Verdict schemas are strict JSON** — the orchestrator parses mechanically so it can't be talked into a wrong conclusion.
- **Pre-registered kill/survive conditions** are frozen before execution. If they drift after the fact, the system is rationalizing, not falsifying.
- **`inconclusive` is first-class.** Forcing `killed`/`survived` on ambiguous output is the failure mode this plugin exists to prevent.

---

## Session state

Per-repo, per-branch. Survives across invocations.

```
.god-of-debugger/
├── current                         active session_id
├── sessions/<session_id>.json      bug, repro, hypotheses, verdicts,
│                                   localization, cost_log, status
└── experiments/H3/
    ├── preregistered.json          kill/survive conditions (frozen)
    ├── experiment.md               human-readable spec
    ├── probe.diff                  temp edits (auto-reverted on close)
    ├── run.log                     repro stdout/stderr
    └── verdict.json                strict schema from hypothesis-runner
```

`session_id = <8-char-uuid>-<branch-slug>` so parallel worktrees don't collide.

---

## Budgets

Per-experiment, enforced by the subagent. Budget exhausted without a decisive verdict → `inconclusive`, counts as alive, user decides whether to invest more.

| Budget | Default | Overridable at Gate 1? |
|---|---|---|
| Wall clock | 120 s | yes |
| Tokens | 50 k | yes |
| Iterations | 100 repro runs | yes |

---

## Plugin layout

```
god-of-debugger/
├── .claude-plugin/plugin.json
├── commands/
│   └── god-of-debugger.md       single entry command; orchestrates everything
├── skills/
│   ├── repro/SKILL.md           repro bootstrap + session state
│   ├── debug/SKILL.md           localization + hypothesis generation
│   ├── run/SKILL.md             parallel execution
│   └── promote/SKILL.md         auto + manual regression-test promotion
├── agents/
│   ├── adversary.md
│   ├── hypothesis-runner.md
│   └── bisect-runner.md         (v0.2)
├── hooks/
│   ├── hooks.json
│   └── guard-ship-the-fix.sh
└── README.md
```

The four skills are internal steps of `/god-of-debugger`, not separate slash commands. They run automatically in order; you only ever type the one command.

---

## Design notes

- **The quality of this plugin is the quality of `skills/debug/SKILL.md`.** That prompt is the hypothesis-generation engine. Everything else is plumbing.
- **v0.1 ships experiment types 1–3** (log probe, assertion, unit test). Types 4–6 (git bisect, dependency pin, environment toggle) land in v0.2.
- **Telemetry is local-only.** Fix commits get a `God-Of-Debugger-Session: <id>` trailer; a reporting script (v0.2) walks git history to compute held/reverted/amended/regressed per session. No network calls, ever.

---

## License

MIT. See [`LICENSE`](../../LICENSE) in the repository root for the full text.
