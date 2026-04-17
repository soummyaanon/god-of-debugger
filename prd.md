PRD: god-of-debugger — a Claude Code plugin that debugs by disproving

Working name, kept from the user's request. "Counterfactual" or "Falsify" may be better at ship time — this name is load-bearing in marketing, not architecture.

Author: [you]
Status: Draft v0.1
Target runtime: Claude Code plugin system (.claude-plugin/plugin.json)

1. The problem

Debugging, as practiced by most humans and by Claude out of the box, looks like this:

Read the bug report / stack trace.
Form one plausible hypothesis.
Scan the code for evidence that confirms it.
Ship a patch.
Move on.

This is confirmation-biased guessing with extra steps. It produces fixes that work incidentally — the bug goes away, but nobody can tell you whether the "cause" was actually the cause or a correlated artifact. The same bug reappears three weeks later in a slightly different shape, and the "fix" becomes dead weight in the codebase.

Senior engineers don't debug this way. They debug by elimination: enumerate what could plausibly be wrong, then for each candidate, design the cheapest possible experiment whose outcome would rule it out. What survives elimination is the cause. This is just the scientific method, and it is almost entirely absent from how AI coding assistants operate today.

The industry hasn't built this tool because the market incentive is "answer fast." Counterfactual debugging is deliberately slower per iteration and dramatically faster per actually-fixed bug.

1.1 Anti-examples — what a bad hypothesis looks like

Bad hypotheses are vague, unfalsifiable, or clustered on one cause. The prompt must reject these explicitly:

- "Maybe there's a null somewhere." — no location, no predicate, no experiment.
- "The cache might be wrong." — which cache, what wrong, what would prove it?
- Seven variants of "the null check on line 42 is off by one." — one causal category, not seven hypotheses.
- "It's a race condition." — asserted, not falsifiable without a concrete interleaving.

Good hypotheses name a specific mechanism at a specific location with a predicate an experiment can check: "cart_session map is mutated without lock from the expiry goroutine; assertion on map write-holder should trip under load."

2. What we're building

A Claude Code plugin — god-of-debugger — that turns a bug report into a falsification protocol.

When invoked on a bug, the plugin:

Generates 5–8 explicit hypotheses about what could be causing it, across distinct causal categories (not 8 variants of "maybe the null check is wrong"). Hypotheses must span at least 4 of these axes: data, control-flow, concurrency, config/env, dependency, contract/boundary, resource/quota. The prompt rejects a set that clusters on one axis.
Runs an adversarial pass after the primary list. A separate agent sees the primary hypotheses and is explicitly told to find the category gap: config, env, deployment, human error, upstream/downstream, or "the premise is wrong". It adds 2–3 hypotheses labeled `origin: adversarial`.
Localizes the bug before fan-out so each subagent receives only the narrow file/function set relevant to its hypothesis rather than the whole repo.
Designs a falsification experiment for each — the cheapest artifact that, if executed, would prove that hypothesis false. Experiments are typed: log probe, assertion, targeted unit test, git bisect range, dependency pin, environment toggle.
Pre-registers the falsification criterion for each hypothesis before execution: what exact observation kills it, and what exact observation lets it survive. Runners judge against that pre-registered criterion rather than rationalizing after the fact.
Runs them in parallel using Claude Code subagents, one hypothesis per agent.
Reports a survival table: which hypotheses were killed, which survived, and what each experiment learned.
Refuses to propose a fix while more than one hypothesis survives. The user is forced to either run more experiments or declare a tie.
Promotes surviving experiments into regression tests once a fix lands, so the falsification artifacts don't get thrown away.

The deliverable is a scientific method loop, wearing a plugin's clothes.

2.5 Repro contract

Falsification requires a trigger. Before any hypothesis runs, the plugin establishes a reproduction:

- User supplies a repro command (shell one-liner, test invocation, or script path) that fails on the bug.
- If none supplied, the plugin runs a short interactive bootstrap to build one — minimum viable repro, not a full harness.
- Repro is recorded in session state and re-run by every subagent. A hypothesis's verdict is meaningful only relative to a repro.
- If the bug is not reliably reproducible (e.g. <30% hit rate), the plugin surfaces this and offers two paths: (a) run hypotheses against N repetitions with statistical verdicts, or (b) halt and ask the user to harden the repro first. No silent proceed.

2.6 When falsification fails

Three degenerate outcomes, each with a defined exit:

- All hypotheses killed. The hypothesis set was wrong. Plugin re-prompts with the negative evidence as context and generates a second round weighted toward axes not yet covered. Cap at two rounds before handing back to the user.
- Zero hypotheses killed (all survived or inconclusive). Experiments were too weak or the repro is too coarse. Plugin offers to tighten experiments (narrower assertions, longer runs, finer log probes) before adding more hypotheses.
- Repro itself flaky mid-session. Detected when the same experiment flips verdict across retries. Plugin halts falsification, marks session `repro_unstable`, and sends the user to repro hardening.

3. Non-goals
Not a replacement for Claude Code's default debugging. Users opt in via /god-of-debugger:debug when a bug is hard, flaky, or has been "fixed" before.
Not a general-purpose test generator. Experiments are narrow, falsification-targeted, and often temporary.
Not a CI system. Parallel execution happens within a single Claude Code session using subagents, not across remote workers.
Not autonomous. The user approves which hypotheses to pursue, reviews the survival table, and signs off on promotion to regression tests.
4. Users and when they reach for this

The target user is an engineer (or team) who has hit one of:

A bug that has been "fixed" before and came back.
A flaky test where the last three theories didn't pan out.
A production incident where the obvious cause feels too obvious.
A legacy system where nobody trusts their mental model anymore.

The anti-pattern the plugin targets is the moment when the engineer (or Claude) says "it's probably X" and starts writing a patch. The plugin forces a pause: prove X by eliminating not-X.

5. User-visible surface
5.1 Commands (skills)

Four slash commands, namespaced under the plugin. (Terminology: these are Claude Code slash commands backed by skill files; "skill" and "command" are used interchangeably below, but the user-facing surface is `/god-of-debugger:*`.)

Command	Trigger	Purpose
/god-of-debugger:repro	/god-of-debugger:repro <bug description>	Optional bootstrap. Builds or verifies a reliable reproduction command and writes it to session state. Skipped if the user supplies a repro directly to `:debug`.
/god-of-debugger:debug	/god-of-debugger:debug <bug description or path to bug report>	Entry point. Generates hypotheses, designs experiments, presents the plan for approval.
/god-of-debugger:run	/god-of-debugger:run	Executes approved experiments in parallel via subagents. Produces the survival table.
/god-of-debugger:promote	/god-of-debugger:promote	After a fix lands, re-runs surviving experiments against the fixed tree and promotes the ones that (a) failed without the fix and (b) pass with it into permanent regression tests.

Splitting is deliberate: each command has a distinct approval gate (repro → hypothesis list → experiment design → test promotion), and the user sees each gate.

5.2 The hypothesis table

After /god-of-debugger:debug, the user sees something like:

Bug: intermittent 500s on /api/checkout under load

Hypotheses (7):
  H1  Race on shared cart_session map             [assertion + stress loop]
  H2  DB connection pool exhaustion               [log probe + pool metrics]
  H3  Upstream payment API timeout cascade        [mock + latency injection]
  H4  Stale Redis key with wrong TTL              [targeted unit test]
  H5  JSON deserialization of null inventory      [existing test w/ new fixture]
  H6  Recent dependency bump in serde             [git bisect: main..HEAD~20]
  H7  Load balancer sticky-session misconfig      [env toggle + log probe]

Approve all / edit / drop some?


Each row has a hypothesis, an experiment type, and an estimated cost. The user edits freely before anything runs.

5.3 The survival table

After /god-of-debugger:run:

Results: 3 of 7 survived

 KILLED    H1  Race on cart_session map          — assertion never fired across 10k iterations
 KILLED    H2  DB pool exhaustion                — pool depth maxed at 12/50 during repro
 KILLED    H5  Null inventory deserialization    — new fixture test passed cleanly
 KILLED    H7  Sticky-session misconfig          — bug reproduces with sticky sessions disabled

 SURVIVED  H3  Payment API timeout cascade       — latency injection reproduces the 500s
 SURVIVED  H4  Stale Redis key with wrong TTL    — TTL inspection shows keys at 7d instead of 1h
 SURVIVED  H6  serde bump                        — bisect narrowed to 3 commits; need one more round

Next: run deeper falsification on H3, H4, H6? Or declare H3+H4 a compound cause?


Notice what the plugin does not do: it does not say "the bug is H3." It reports the survivors and asks for the next move.

5.4 The refusal

If the user asks Claude to write a fix while more than one hypothesis survives, the plugin's skill instructions tell Claude to push back:

Three hypotheses are still alive (H3, H4, H6). Shipping a fix now means guessing which one it is. Want to run another round of falsification, or explicitly accept that you're guessing?

This friction is the feature.

6. Architecture inside the plugin
god-of-debugger/
├── .claude-plugin/
│   └── plugin.json
├── skills/
│   ├── debug/
│   │   └── SKILL.md          ← hypothesis generation + experiment design
│   ├── run/
│   │   └── SKILL.md          ← parallel execution orchestration
│   └── promote/
│       └── SKILL.md          ← experiment → regression test conversion
├── agents/
│   ├── adversary.md          ← subagent: finds missing categories the primary list skipped
│   ├── hypothesis-runner.md  ← subagent: runs ONE experiment, reports killed/survived/inconclusive
│   └── bisect-runner.md      ← specialized subagent for git bisect experiments
├── hooks/
│   └── hooks.json            ← PostToolUse hook: block ship-the-fix when >1 hypothesis survives
└── README.md

6.1 Why subagents

Each hypothesis gets its own subagent because:

They run in parallel — 7 hypotheses × 2 min each is 2 min, not 14.
They have isolated context — a subagent chasing H3 doesn't get confused by evidence for H5. Each subagent receives only `{ bug_summary, repro_command, hypothesis, repo_path, budget }`, and `hypothesis.relevant_files` narrows the code it should read. It does not see other hypotheses, other verdicts, or prior session transcripts.
They report in a structured schema — `{ hypothesis_id, origin, verdict: killed|survived|inconclusive, confidence, evidence, falsification_check, artifact_path, budget_consumed, retries }` — which the parent agent aggregates into the survival table. `inconclusive` is reserved for subagents that exhausted their budget without a decisive result; the evidence field must explain which signal was missing.

6.1.1 Why the adversary

Falsification only works if the true cause is actually present in the candidate set. The primary generator will be biased toward code bugs because code is the visible surface and the model is trained heavily on code. A dedicated adversarial pass is the cheapest correction:

- it is prompt-defined rather than infrastructure-heavy
- it specifically searches for categories the primary pass tends to miss
- it gives the user a visible check against "you never even considered the embarrassing possibility"

The adversary's outputs are labeled `origin: adversarial` for traceability, but once generated they are tested exactly like primary hypotheses.
6.2 Why the hook

The PostToolUse hook watches for Write/Edit tool calls during a god-of-debugger session. If the session state shows >1 surviving hypothesis and Claude tries to edit non-experiment code, the hook blocks the edit and injects a reminder to finish falsification first. Without this hook, Claude's default "ship the fix" instinct leaks back in.

"Non-experiment code" is defined by an explicit allowlist, not inferred:

- Paths under `.god-of-debugger/experiments/**` are always allowed.
- Files opened with a probe marker comment (`// @god-of-debugger:probe H3`) are allowed for the duration of the session and auto-reverted on `:promote` or session close.
- Everything else is blocked while >1 hypothesis survives.

The hook reads `.god-of-debugger/session.json` to determine current survivor count. If the file is absent or the session is marked closed, the hook is a no-op.

6.3 Session state

The plugin keeps per-session state in `.god-of-debugger/sessions/<session_id>.json` at the repo root, with `.god-of-debugger/current` as a symlink/pointer to the active session. A session id is a short UUID plus branch name, so parallel worktrees do not collide.

{
  "session_id": "a1b2c3-feature-checkout",
  "branch": "feature/checkout",
  "bug": "intermittent 500s on /api/checkout",
  "repro": { "command": "pytest -k test_checkout_load", "hit_rate": 0.85, "runs": 20 },
  "localization": {
    "relevant_files": ["checkout/service.go", "cart/session.go", "deploy/docker-compose.yml"],
    "basis": "stack trace + git log on touched files"
  },
  "hypotheses": [
    {
      "id": "H1",
      "origin": "primary",
      "text": "...",
      "axis": "concurrency",
      "relevant_files": ["cart/session.go"],
      "kill_condition": "...",
      "survive_condition": "...",
      "experiment": {...},
      "verdict": "killed",
      "evidence": "...",
      "artifact_path": ".god-of-debugger/experiments/H1/"
    },
    ...
  ],
  "cost_log": {
    "runs": []
  },
  "experiments_dir": ".god-of-debugger/experiments/",
  "status": "open|closed|repro_unstable",
  "created_at": "...",
  "closed_at": null
}

This is what /god-of-debugger:run reads to dispatch subagents, and what /god-of-debugger:promote reads to find candidates for regression tests.

6.4 Experiment output artifacts

Each hypothesis subagent writes to `.god-of-debugger/experiments/<Hn>/`:

- `preregistered.json` — copy of the falsification conditions and experiment spec before execution.
- `experiment.md` — human-readable spec the subagent executed.
- `probe.diff` — any temporary code it inserted (for revert on session close).
- `run.log` — stdout/stderr of the repro with the probe active.
- `verdict.json` — the structured schema from §6.1.
- `artifact.*` — optional: a test file, fixture, or bisect log the experiment produced.

`:promote` consumes these directories. Session close reverts `probe.diff` across all surviving directories.

7. The experiment taxonomy

Every experiment must be typed. This is non-negotiable because the subagent needs to know how to execute it and how to decide "killed vs survived." The MVP supports six types:

Log probe — insert a log line at a specific location, run the repro, check whether the line fires and what it prints. Killed if the predicted value never appears.
Assertion — insert a temporary assert, run the repro, check whether it trips. Killed if the assertion holds across N runs.
Unit test — write a test designed to fail if the hypothesis is true. Killed if the test passes.
Git bisect — run git bisect across a specified range with a specified reproduction command. Killed if the range contains no culprit commit.
Dependency pin — downgrade/upgrade a specific dependency, re-run the repro. Killed if the bug persists across the pinned versions.
Environment toggle — flip a config, feature flag, or env var and re-run. Killed if the bug is independent of the toggle.

Any hypothesis that can't be expressed as one of these gets flagged for the user to either reformulate or accept as untestable. Untestable hypotheses are shown but never "survive" — they're parked.

MVP (v0.1) implements types 1–3 only (log probe, assertion, unit test). Types 4–6 (git bisect, dependency pin, environment toggle) ship in v0.2 — hypotheses of those types in v0.1 are parked with a message.

7.1 Experiment budgets

Every experiment carries a budget, enforced by the subagent. Defaults:

- Wall clock: 120 seconds per experiment.
- Tokens: 50k per subagent.
- Iterations: 100 repro runs for statistical experiments (e.g. race detection under load).

Budgets are overridable per hypothesis at approval time. When a subagent hits any budget without a decisive verdict, it returns `inconclusive` with `budget_consumed` set and `evidence` describing the last signal seen. Inconclusive hypotheses count toward "survived" for the refusal-to-fix gate — the user must decide to invest more budget or drop them.

7.2 Token efficiency and model routing

The plugin is intentionally token-heavy, so it needs explicit controls:

- Localization first. This is the dominant cost lever; if a runner gets the whole repo, the orchestrator already failed.
- Cheap-first experiments. Kill easy hypotheses with probes/toggles before escalating to slower tests or bisects.
- Prompt caching layout. Stable instruction blocks belong at the front of repeated agent prompts.
- Model routing. Use a stronger model for experiment design and a cheaper model for verdict extraction when the output is already strongly structured.
- Cost logging. Every run appends model and token data into `session.cost_log`; optimization order should be driven by that data, not by intuition.

8. Success criteria

A user finds this plugin valuable if, on hard bugs:

Fix permanence improves. Bugs "fixed" with god-of-debugger stay fixed; bugs fixed by the default loop regress at a higher rate. Measure via regression-rate tagging over 30–90 days.
Wrong-cause fixes drop. Track the rate at which a proposed fix is later reverted or amended. Counterfactual sessions should have a meaningfully lower rate.
Regression test coverage grows organically. Each god-of-debugger session that ends in a fix should leave behind ≥1 promoted experiment as a permanent test. Over a quarter, this compounds.
Users reach for it on hard bugs, not easy ones. The plugin is not trying to replace Claude's default debugger. If people are using it for trivial bugs, the friction is miscalibrated.

Anti-goal metric: average time-to-fix per bug. This plugin is slower per bug and that is the correct trade.

8.1 Telemetry plan

To make the success criteria measurable rather than aspirational:

- Every session writes `session_id` and final `fix_commit_sha` (if any) into `.god-of-debugger/sessions/<id>.json`.
- The fix commit is tagged with a trailer: `God-Of-Debugger-Session: <session_id>`.
- A reporting script (shipped in the plugin) walks git history, finds commits that revert or `Fixes:` a tagged commit, and emits a per-session outcome: `held`, `reverted`, `amended`, `regressed`.
- Aggregated monthly: regression rate for tagged vs untagged fixes in the same repo. This is the measurement behind criterion 1 (fix permanence) and criterion 2 (wrong-cause rate).
- Criterion 3 (regression test growth) is trivial: count promoted experiments per session and sum.
- Criterion 4 (used on hard bugs) is proxied by time-since-file-last-touched and prior-fix-count on files the session modified. If sessions consistently target files with no prior churn, the tool is being used on easy bugs.

All telemetry is local to the repo. No network calls.

9. MVP scope (v0.1)

Ship the smallest version that tests the core thesis:

 plugin.json manifest.
 The hypothesis-generation prompt (`skills/debug/SKILL.md` body) — the single highest-leverage asset. Must enforce axis diversity (§2), reject anti-examples (§1.1), and bind each hypothesis to one of experiment types 1–3.
 /god-of-debugger:debug skill — generates 5–8 hypotheses and designs experiments. Presents for approval. Writes `.god-of-debugger/sessions/<id>.json`.
 /god-of-debugger:run skill — reads session state, spawns one hypothesis-runner subagent per approved hypothesis, aggregates results into the survival table.
 hypothesis-runner agent — handles types 1–3 (log probe, assertion, unit test) with budget enforcement (§7.1). Returns structured verdict.
 Repro contract enforcement (§2.5): `:debug` refuses to proceed without a repro command in session state. `:repro` bootstrap command can ship in v0.1 as a thin wrapper that just records what the user provides.
 A single hook that blocks non-experiment edits when >1 hypothesis survives, using the allowlist rules from §6.2.
 Degenerate-outcome handling from §2.6 (all killed, zero killed, flaky mid-session).
 Telemetry: session-id git trailer on fix commits (§8.1). Reporting script can defer to v0.2.
 README.md with a worked example.

Deferred to v0.2+:

/god-of-debugger:promote skill.
bisect-runner agent and the git-bisect experiment type.
Dependency-pin and environment-toggle experiment types.
Cross-session learning (did this hypothesis pattern pay off in the past?).
Cost estimator for experiments (so the user knows H6 is going to take 20 min).
Telemetry reporting script that walks git history and emits held/reverted/amended/regressed per session.
Statistical-verdict mode for low-hit-rate repros (§2.5 path a).
10. Open questions
How aggressive should hypothesis generation be? 5 hypotheses risks missing the cause; 10 risks diluting effort. Start at 5–8 and tune.
What does "inconclusive" look like operationally? A subagent that can't decide killed/survived within a reasonable budget. Does it retry with a refined experiment, or punt to the user? MVP: punt to the user.
Should the plugin refuse entirely if no hypothesis can be falsified cheaply? Probably yes — the whole point is that cheap falsification is the unit of progress. If every experiment is expensive, the user should know before committing.
Integration with existing test frameworks. The promotion step needs to drop experiments into the right place (tests/, spec/, __tests__/) with the right imports. Detect from the repo; don't ask.
11. Getting started — concrete next steps
mkdir god-of-debugger && cd god-of-debugger && mkdir -p .claude-plugin skills/debug skills/run agents hooks
Write .claude-plugin/plugin.json with the manifest.
Write skills/debug/SKILL.md — this is where the hypothesis-generation prompt lives, and it is the single highest-leverage file in the plugin. The quality of the plugin is the quality of this prompt.
Write agents/hypothesis-runner.md — the subagent that executes one experiment. Keep its output schema strict.
Test locally on a real flaky bug in a repo you own: claude --plugin-dir ./god-of-debugger, then /god-of-debugger:debug <your bug>.
Iterate on the hypothesis prompt until the hypotheses feel diverse (different causal categories, not 7 flavors of the same guess) and the experiments feel cheap (mostly runnable in seconds, not minutes).

The plugin stands or falls on step 3. Everything else is plumbing.
