# god-of-debugger

**Debug by disproving.** A Claude Code plugin that turns a bug report into a falsification protocol — hypotheses, parallel experiments, and a fix only when exactly one hypothesis survives.

> One command. One paste. Enter to keep going.

---

## Why this exists

The default debugging loop — yours, mine, Claude's — looks like this:

```
read stack trace → form one hypothesis → scan for confirming evidence → ship patch → move on
```

That's confirmation-biased guessing with extra steps. The bug "goes away," nobody can prove the cause was the cause, and three weeks later it comes back in a slightly different shape.

Senior engineers debug by **elimination**: enumerate what could be wrong, design the cheapest experiment that would rule each one out, and let what survives be the cause.

`god-of-debugger` makes Claude do exactly that, in parallel, behind one slash command.

---

## Install

```bash
# Local development
claude --plugin-dir ./god-of-debugger

# Or from a marketplace once published
/plugin install god-of-debugger
```

---

## The only command you need

```bash
/god-of-debugger <paste your bug here>
```

That's it. The whole pipeline runs end-to-end:

```
  1. establish repro           →   a deterministic way to trigger the bug
  2. localize                  →   narrow to the files that matter
  3. generate hypotheses       →   5–8 primary + 2–3 adversarial
  4. design experiments        →   one falsification test per hypothesis
  5. run in parallel           →   one subagent per hypothesis
  6. survival table            →   killed / survived / inconclusive
  7. propose fix               →   ONLY if exactly one survives
  8. promote to regression     →   silently, one line of output
```

Two inline gates pause the flow so you can intervene. Hitting Enter keeps going.

---

## The user journey

### Scenario: "My checkout API throws 500s under load. Sometimes."

You've been poking at this for an hour. You have a guess. You don't trust your guess. You type:

```bash
/god-of-debugger "intermittent 500s on /api/checkout under load"
```

#### Step 1 — Repro

```
Establishing reproduction...
→ Detected pytest framework.
→ Suggested repro: pytest -k test_checkout_load
→ Running 20 iterations... 18/20 failed (90% hit rate). Locked in.

Session: a1b2c3-feature-checkout
```

If you already have a repro command, you can skip the bootstrap:

```bash
/god-of-debugger --repro "pytest -k test_checkout_load" "intermittent 500s on /api/checkout"
```

#### Step 2 — Localize + hypothesize

```
Localizing...
→ Touched files: checkout/service.go, cart/session.go, deploy/docker-compose.yml
→ Basis: stack trace + recent git log

Generating hypotheses (primary)...
Generating hypotheses (adversarial)...
```

#### Gate 1 — review the plan

```
┌──────────────────────────────────────────────────────────────────────────┐
│ Bug:  intermittent 500s on /api/checkout under load                      │
│ Repro: pytest -k test_checkout_load  (18/20 hit rate)                    │
├────┬───────┬──────────────┬──────────────────────────────┬───────────────┤
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

- Hit **Enter** → all 9 experiments run in parallel.
- Type **`e`** → drop rows, rewrite kill conditions, change budgets, then re-prompt.
- Type **`s`** → same as Enter, for muscle memory.

#### Step 3 — Parallel execution

```
Dispatching 9 hypothesis-runner subagents...

  [H1] concurrency    ████████████████████  done (killed)
  [H2] resource       ████████████████████  done (killed)
  [H3] upstream       ████████████████████  done (survived)
  [H4] data           ████████████████████  done (survived)
  [H5] contract       ████████████████████  done (killed)
  [H6] dependency     ████████████████████  done (inconclusive — needs bisect)
  [H7] control-flow   ████████████████████  done (killed)
  [H8] config/env     ████████████████████  done (killed)
  [H9] deploy         ████████████████████  done (killed)

6 killed · 2 survived · 1 inconclusive
```

#### Gate 2 — survival table

```
┌────┬────────────┬─────────────────────────────────────────────────────────┐
│ ID │ VERDICT    │ EVIDENCE                                                │
├────┼────────────┼─────────────────────────────────────────────────────────┤
│ H1 │ KILLED     │ assertion never fired across 10k iterations             │
│ H2 │ KILLED     │ pool depth maxed at 12/50 during repro                  │
│ H3 │ SURVIVED   │ latency injection reproduces the 500s                   │
│ H4 │ SURVIVED   │ TTL inspection shows keys at 7d instead of 1h           │
│ H5 │ KILLED     │ new fixture test passed cleanly                         │
│ H6 │ INCONCLUS. │ budget exhausted mid-bisect                             │
│ H7 │ KILLED     │ retry path disabled, bug persists                       │
│ H8 │ KILLED     │ sticky sessions disabled, bug persists                  │
│ H9 │ KILLED     │ memory limit doubled, bug persists                      │
└────┴────────────┴─────────────────────────────────────────────────────────┘

3 survived (H3, H4, H6 — inconclusive counts as alive).
[Enter] see details  ·  [f] propose fix  ·  [m] more experiments  →
```

- Hit **Enter** → expand evidence and artifact paths for each survivor, re-prompt.
- Type **`m`** → run a second round of tighter experiments against the survivors. Most sessions converge here.
- Type **`f`** → propose a fix. **Disabled** while more than one hypothesis is alive. You'll see:

```
3 hypotheses are still alive (H3, H4, H6). Shipping a fix now means guessing
which one it is. Want to run another round of falsification, or explicitly
accept that you're guessing?
```

This refusal is the whole point. It's also backed by a Claude Code hook that will block `Write`/`Edit` to production files while survivors ≠ 1 — so even a yolo run can't cheat.

#### Step 4 — Converge

You type **`m`**. A second round runs with narrower experiments:

```
Round 2: tightening H3, H4, H6...

  [H3] upstream   ████████████████████  done (killed — timeout is a symptom, not cause)
  [H4] data       ████████████████████  done (survived — confirmed)
  [H6] dependency ████████████████████  done (killed — bisect cleared the range)

1 survived (H4).
[Enter] see details  ·  [f] propose fix  ·  [m] more experiments  →
```

#### Step 5 — Fix

You type **`f`**.

```
Proposing fix for H4 (stale Redis TTL):
→ cart/session.go:142 — TTL was hard-coded to 7*24h instead of 1h.
→ Writing minimal patch...
→ Running pytest -k test_checkout_load to verify... 20/20 pass.
```

#### Step 6 — Silent promotion

```
Added 1 regression test to tests/test_checkout_session_ttl.py.
Session closed. Fix commit tagged: God-Of-Debugger-Session: a1b2c3-feature-checkout
```

Done. Total elapsed: ~4 minutes.

---

## When you trust the loop: `--yolo`

```bash
/god-of-debugger --yolo --repro "pytest -k test_checkout" "intermittent 500s on /api/checkout"
```

Zero gates. Runs end-to-end. Prints the final survival table. If exactly one hypothesis survives, writes the fix and the regression test. If not, prints the refusal and stops.

`--yolo` skips gates. It does **not** bypass the fix-refusal. Correctness is not a gate.

---

## Flag reference

| Flag | Effect |
|---|---|
| (no flags) | Full pipeline with two inline gates. Enter at either gate keeps going. |
| `--yolo` | Skip both gates. Fix-refusal still applies. |
| `--repro "<cmd>"` | Skip the repro bootstrap. Use `<cmd>` directly. |

Flags combine: `--yolo --repro "..."` is the full autopilot.

---

## The two gates, at a glance

```
                  ┌─────────────────────────────────────────────┐
                  │  Found N hypotheses.                        │
    Gate 1        │  [Enter] run all · [e] edit · [s] skip  →   │
                  └─────────────────────────────────────────────┘

                  ┌─────────────────────────────────────────────┐
                  │  K survived.                                │
    Gate 2        │  [Enter] details · [f] fix · [m] more  →    │
                  └─────────────────────────────────────────────┘
```

Default = Enter = autopilot. Power users intervene with one keypress.

---

## When to reach for this

Use it when:

- A bug has been "fixed" before and came back.
- A flaky test where the last three theories didn't pan out.
- A production incident where the obvious cause feels too obvious.
- A legacy system where nobody trusts their mental model anymore.

Don't use it for:

- Typos, missing imports, or anything a linter catches.
- Bugs where the fix is already obvious and cheap to verify.

This plugin is **slower per bug on purpose**. It trades per-iteration speed for per-fix permanence. If you're using it for trivial bugs, you'll hate the friction. That's the friction working.

---

## What happens under the hood

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
         │                   │                   │
         │                   │      ┌────────────┴─────────────┐
         │                   │      ▼             ▼            ▼
         │                   │  hypothesis-  hypothesis-  hypothesis-
         │                   │   runner       runner       runner
         │                   │     (H1)         (H2)        ... (HN)
         │                   │      │             │            │
         │                   │      └─────────────┼────────────┘
         │                   │                    ▼
         │                   │           survival table
         │                   │                    │
         │                   └──> adversary ──────┘
         │                                        │
         │            ┌───────────────────────────┘
         │            ▼
         │      skills/promote  (auto, only if survivors == 1)
         │            │
         └────────────┴──> .god-of-debugger/ (session state + artifacts)
```

- **Subagents** isolate context — each `hypothesis-runner` sees only the bug, the repro, its one hypothesis, and narrowed `relevant_files`. It never sees other hypotheses or verdicts, so it can't be biased by them.
- **The adversary** is a separate subagent that reads the primary list and is told to find the category gap (config, env, deploy, human error, premise-wrong). It exists to cover the model's code-bias.
- **The hook** (`PostToolUse` on `Write|Edit`) reads session state and blocks production-file edits while survivor count ≠ 1. Even `--yolo` can't fight it.

---

## Session state

Per-repo, per-branch. Survives across invocations:

```
.god-of-debugger/
├── current                         active session_id (plain text)
├── sessions/
│   └── <session_id>.json           bug, repro, hypotheses, verdicts, survivors,
│                                   localization, cost_log, status
└── experiments/
    └── H3/
        ├── preregistered.json      kill/survive conditions, frozen pre-execution
        ├── experiment.md           human-readable spec
        ├── probe.diff              temp code edits (auto-reverted on close)
        ├── run.log                 repro stdout/stderr
        └── verdict.json            strict schema from hypothesis-runner
```

`session_id = <8-char-uuid>-<branch-slug>` so parallel worktrees don't collide.

---

## Budgets

Each experiment carries a budget, enforced by the subagent:

| Budget | Default | Overridable at Gate 1? |
|---|---|---|
| Wall clock | 120 s | yes |
| Tokens | 50 k | yes |
| Iterations | 100 repro runs | yes |

Budget exhausted without a decisive verdict → `inconclusive`, counts as alive, user decides whether to invest more.

---

## Design notes

- **The quality of this plugin is the quality of `skills/debug/SKILL.md`.** That prompt is the hypothesis-generation engine. Everything else is plumbing.
- **The adversary pass** exists because the model is trained heavily on code and will under-generate config/env/deploy/"premise is wrong" hypotheses. A dedicated adversarial subagent is the cheapest correction.
- **Verdict schemas are strict JSON** — the orchestrator parses mechanically so it can't be talked into a wrong conclusion mid-session.
- **Pre-registered kill/survive conditions** are frozen before execution. If they drift after the fact, the system is no longer falsifying, it's rationalizing.
- **`inconclusive` is first-class.** Forcing `killed`/`survived` on ambiguous output is the failure mode this plugin exists to prevent.
- **v0.1 ships experiment types 1–3** (log probe, assertion, unit test). Types 4–6 (git bisect, dependency pin, environment toggle) land in v0.2.
- **Telemetry is local-only.** Fix commits get a `God-Of-Debugger-Session: <id>` trailer; a reporting script (v0.2) walks git history to compute held/reverted/amended/regressed per session. No network calls, ever.

---

## Plugin layout

```
god-of-debugger/
├── .claude-plugin/plugin.json
├── commands/
│   └── auto.md                  single entry command, orchestrates everything
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

---

## License

MIT
