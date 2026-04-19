---
description: Internal step of /god-of-debugger. Converts surviving debugging experiments into permanent regression tests. Tags fix commit with session id. Invoked after fix accepted. Silent, no prompts.
---

# Promote — experiment → regression test (+ telemetry)

Bug not pinned by failing test = bug comes back. Three phases:

1. Surviving experiment → permanent regression test that fails **now** (pre-fix).
2. After fix lands, re-run every surviving experiment. Verdict must flip (fail → pass). Only flipped ones promoted.
3. Append `God-Of-Debugger-Session: <session_id>` trailer to fix commit.

## Two modes

- **Auto mode** (default from `commands/go.md`): fix just written same session. No prompts. No pauses between phases. Run all three in one pass. One output line (see bottom).
- **Manual mode**: user invokes directly. Phase-by-phase with verbose output.

Detect: caller passes `mode=auto` or tool context is `commands/go.md` → auto. Else manual.

## Inputs

1. `.god-of-debugger/current` → `session_id`.
2. `.god-of-debugger/sessions/<session_id>.json` → **exactly one** entry in `survivors`.

`survivors.length != 1` → STOP. Promotion only valid when root cause locked in.

## Phase 1 — write regression test (pre-fix)

1. **Detect framework.** Check `package.json`, `pytest.ini`/`pyproject.toml`, `Cargo.toml`, `go.mod`, `Gemfile`, etc. Match existing style (file location, naming, assertion lib). No new framework.
2. **Right test file.** Prefer co-locate with code under test or existing tests for same module. Never new top-level `tests/` if one exists elsewhere.
3. **Write test.** Must:
   - Reproduce exact failure from surviving experiment.
   - Assert on specific observable from `experiment.expected_if_true` — not generic "no crash".
   - Carry comment: bug summary, `session_id`, `hypothesis.id`, `hypothesis.claim`.
   - Fail now against unfixed code.
4. **Run test.** Confirm fail matching original bug. If passes, test wrong — rewrite until captures real failure.
5. **Record** path in `session.regression_test`.
6. Tell user: **"Regression test added, failing at `<path>::<name>`. Implement fix. Re-run skill after fix."**

## Phase 2 — post-fix verification

Triggered on re-invoke of `/god-of-debugger:promote` after fix committed/staged.

1. Run regression test. Must pass. Still fails → fix incomplete. Halt.
2. Re-run surviving experiment from `.god-of-debugger/experiments/<Hn>/experiment.md`. Verdict must flip to `killed` (hypothesis that survived now falsified — fix removed cause).
   - Flipped → promote.
   - Still survived → fix doesn't address cause. Halt. Tell user.
3. Revert every `probe.diff` under `.god-of-debugger/experiments/*/probe.diff` not yet reverted. Tree clean except promoted test.
4. `session.status = "closed"`. `session.closed_at`. Delete `.god-of-debugger/current`.

## Phase 3 — telemetry trailer

Fix not committed yet → prompt user stage + write commit with trailer:

```
God-Of-Debugger-Session: <session_id>
```

Commit exists → offer `git commit --amend --no-edit` **only** with explicit consent. Never amend published commits without approval.

Record `session.fix_commit_sha`.

## Hard rules

- Phase 1: test-only changes. No production edits. Hook blocks anyway.
- Phase 2: no new code. Only re-run.
- Never mark test `skip`/`xfail`/`pending`. Failing test = entire point.
- No asserts on incidental details (timestamps, memory addresses, log formatting) unless those **are** the bug.
- Never force-push. Never amend published commits w/o consent.

## Test naming

Encode behavior, not fix. Good:

- `it("returns empty array instead of null when user has no orders (regression: H2)")`
- `test_cache_eviction_does_not_leak_keys_after_ttl_expiry`

Bad:

- `it("works")`
- `test_fix_for_bug_123`

## Output — phase 1

```
Regression test: <path/to/test>::<test_name>
Status:          FAILING (as expected)
Session:         <session_id>
Next:            implement fix, commit, re-run /god-of-debugger:promote.
```

## Output — phase 2 + 3

```
Regression test: PASSING
Surviving experiment: FLIPPED to killed (fix removed cause)
Fix commit:      <sha> (trailer: God-Of-Debugger-Session: <session_id>)
Session closed.
```

## Auto mode

From `commands/go.md` after fix written:

1. Surviving hypothesis (exactly one, enforced upstream) → generate regression test. Confirm it **would have** failed against pre-fix code — use saved `probe.diff` / experiment artifact, or temporarily `git stash` pre-fix state if cleaner. Restore fixed state before exit.
2. Run new test against fixed code. Must pass. If fails, fix wrong — halt, surface failure. No success claim.
3. Revert every un-promoted `probe.diff` under `.god-of-debugger/experiments/*/probe.diff`.
4. Append `God-Of-Debugger-Session: <session_id>` trailer to fix commit. If not committed yet, leave message for next commit. No auto-amend.
5. `session.status = "closed"`. `session.closed_at = now`. `session.regression_tests = [<paths>]`.

No prompts. No phase headers.

### Auto mode output — **exactly one line**

Success:

```
Added <N> regression tests to <detected-dir>/.
```

Failure (test didn't flip, fix incomplete, framework not detected):

```
No regression tests added — <reason in ≤6 words>. Session: <session_id>.
```

Caller relies on single line. No decoration.
