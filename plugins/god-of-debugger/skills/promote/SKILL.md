---
description: Internal step of /god-of-debugger. Converts surviving debugging experiments into permanent regression tests and tags the fix commit with the session id. Invoked automatically by the main command after a fix is accepted; runs silently with no prompts.
---

# Promote — Experiment → Regression Test (+ Telemetry)

A bug that isn't pinned by a failing test will come back. This skill does three things, in order:

1. Convert the surviving experiment into a permanent regression test that fails **now**, before the fix.
2. After the fix lands, re-run every surviving experiment to confirm the verdict flips (fail → pass). Only experiments that actually flip get promoted.
3. Append a `God-Of-Debugger-Session: <session_id>` trailer to the fix commit so future regression auditing can find it.

## Two invocation modes

- **Auto mode (default when called from `commands/auto.md`).** The fix has just been written in the same session. Do not prompt the user. Do not pause between phases. Run all three phases in one pass and emit exactly one output line (the "auto mode output" section at the bottom).
- **Manual mode.** The user invokes the skill directly, usually between writing the fix and committing it. Run phase-by-phase with the prompts and the verbose output shown below.

Detect the mode: if the caller passes `mode=auto` or the current tool context is `commands/auto.md`, use auto mode. Otherwise manual.

## Inputs

1. `.god-of-debugger/current` → `session_id`.
2. `.god-of-debugger/sessions/<session_id>.json` → must have exactly one entry in `survivors`.

If `survivors.length != 1`, STOP. Promotion is only valid when the root cause is locked in.

## Phase 1 — Write the regression test (pre-fix)

1. **Detect the test framework.** Look for `package.json`, `pytest.ini`/`pyproject.toml`, `Cargo.toml`, `go.mod`, `Gemfile`, etc. Match existing style — file location, naming, assertion library. Do not introduce a new framework.
2. **Find the right test file.** Prefer co-locating with the code under test or with existing tests for the same module. Never create a new top-level `tests/` if one already exists elsewhere.
3. **Write the test.** It must:
   - Reproduce the exact failure condition the surviving experiment exposed.
   - Assert on the *specific observable* from `experiment.expected_if_true` — not a generic "no crash".
   - Carry a comment with: bug summary, `session_id`, `hypothesis.id`, `hypothesis.claim`.
   - Fail right now, against unfixed code.
4. **Run the test.** Confirm it fails with output matching the original bug. If it passes, the test is wrong — rewrite until it captures the actual failure mode.
5. **Record** the test path in `session.regression_test`.
6. Tell the user: **"Regression test added and confirmed failing at `<path>::<name>`. Implement the fix. Re-run this skill after the fix to complete promotion."**

## Phase 2 — Post-fix verification

Triggered when the user re-invokes `/god-of-debugger:promote` after committing/staging a fix.

1. Run the regression test. It must now pass. If it still fails, the fix is incomplete — halt.
2. Re-run the surviving experiment using its artifact at `.god-of-debugger/experiments/<Hn>/experiment.md`. Expected: verdict flips to `killed` (the hypothesis that used to survive is now falsified, because the fix removed its cause).
   - If it flips → experiment is genuinely promoted.
   - If it still survives → the fix does not actually address the cause the hypothesis identified. Halt, tell the user.
3. Revert every `probe.diff` under `.god-of-debugger/experiments/*/probe.diff` that hasn't already been reverted. Leave the tree clean except for the promoted regression test.
4. Mark `session.status = "closed"` and `session.closed_at` in the state file. Delete `.god-of-debugger/current`.

## Phase 3 — Telemetry trailer

If the fix has not yet been committed, prompt the user to stage files and write the commit with this trailer appended:

```
God-Of-Debugger-Session: <session_id>
```

If a commit already exists, offer `git commit --amend --no-edit` only if the user explicitly consents — do not amend published commits without approval.

Record `session.fix_commit_sha` in state.

## Hard rules

- Phase 1: test-only changes. No production edits. The hook would block them anyway.
- Phase 2: no new code. Only re-run.
- Do not mark the test as `skip`/`xfail`/`pending`. A failing test is the entire point.
- Do not assert on incidental details (timestamps, memory addresses, log formatting) unless those *are* the bug.
- Never force-push, never amend published commits without explicit consent.

## Test naming convention

Name encodes the behavior, not the fix. Good:

- `it("returns empty array instead of null when user has no orders (regression: H2)")`
- `test_cache_eviction_does_not_leak_keys_after_ttl_expiry`

Bad:

- `it("works")`
- `test_fix_for_bug_123`

## Output (phase 1)

```
Regression test: <path/to/test>::<test_name>
Status:          FAILING (as expected)
Session:         <session_id>
Next:            implement the fix, commit, then re-run /god-of-debugger:promote.
```

## Output (phase 2 + 3)

```
Regression test: PASSING
Surviving experiment: FLIPPED to killed (fix removed the cause)
Fix commit:      <sha> (trailer added: God-Of-Debugger-Session: <session_id>)
Session closed.
```

## Auto mode

When invoked from `commands/auto.md` after a fix has been written:

1. For the surviving hypothesis (there is exactly one, enforced upstream), generate the regression test and confirm it **would have** failed against the pre-fix code — use the saved `probe.diff` / experiment artifact as the source of the failure signal, or temporarily check out the pre-fix state with `git stash` if that is cleaner. Restore the fixed state before exiting.
2. Run the new test against the fixed code. It must pass. If it fails, the fix is wrong — halt and surface the failure; do not claim success.
3. Revert every un-promoted `probe.diff` under `.god-of-debugger/experiments/*/probe.diff`.
4. Append the `God-Of-Debugger-Session: <session_id>` trailer to the fix commit. If the fix has not been committed yet, leave a message for the next commit instead of amending.
5. Mark `session.status = "closed"`, `session.closed_at = now`, record `session.regression_tests = [<paths>]`.

Do not prompt during any of this. Do not print phase headers.

### Auto mode output (exactly one line)

On success:

```
Added <N> regression tests to <detected-dir>/.
```

On failure (test didn't flip, fix incomplete, or framework not detected):

```
No regression tests added — <reason in 6 words or fewer>. Session: <session_id>.
```

The caller (`commands/auto.md`) relies on this being a single line. Do not add decoration.
