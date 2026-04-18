# Live demo — `/god-of-debugger` end to end

Walkthrough of one real run. Bug: an auth test goes flaky about 1 in 50 runs. No stack trace, no reliable repro. This is the kind of thing people normally "fix" by adding a retry and forgetting.

Session transcript below is lightly trimmed. `>` lines are user input.

---

## 0. Invoke

```
> /god-of-debugger test auth/session_test.py::test_refresh_near_expiry is flaky,
  passes most of the time, fails ~1 in 50 with "token expired" even though we just refreshed it
```

Plugin takes over. No further prompts except two `Enter` gates.

---

## 1. Establish repro

```
[repro] searching for a deterministic trigger...
[repro] suspicion: time-sensitive. pinning clock via freezegun.
[repro] candidate:
        pytest auth/session_test.py::test_refresh_near_expiry \
               --count=200 -p no:randomly --freeze-time="2026-04-18T00:00:00Z"
[repro] fails 200/200 with exp=1745971200, now=1745971200. deterministic.
```

No more "1 in 50." Bug now fires every run. Moving on.

---

## 2. Localize

```
[localize] tracing token path...
  auth/session.py:42  refresh_token()
  auth/session.py:88  is_expired()       ← time comparison here
  auth/jwt.py:14      decode()
[localize] narrowed to auth/session.py:80-95
```

---

## 3. Generate hypotheses

```
[hypotheses] 6 primary + 2 adversarial

H1  off-by-one in is_expired: uses `<` instead of `<=`, so exp==now counts as valid
H2  clock skew between signer and verifier (system clock vs JWT iat)
H3  refresh stores exp in seconds, check reads it as milliseconds
H4  race: refresh writes new token AFTER is_expired check reads old one
H5  timezone bug: exp stored UTC, compared against local now()
H6  JWT library silently rounds exp down on decode

A1  (adversary) test itself freezes time at a boundary that shouldn't be hit in prod
A2  (adversary) caching layer returns stale token ignoring refresh
```

---

## 4. Design experiments — one falsification test each

```
H1  assert is_expired(exp=now) is False  → if True, H1 survives
H2  log signer_ts vs verifier_ts across 1k runs, assert |Δ| < 1s
H3  print type+value of exp at store and at read; must match units
H4  run is_expired and refresh_token concurrently 1k× under asyncio.gather
H5  parse exp with tz-aware datetime, compare to datetime.now(timezone.utc)
H6  decode 1k JWTs, assert decoded_exp == original_exp exactly
A1  run test with freeze-time offset by ±1s; still fail?
A2  flush cache between refresh and check; still fail?
```

---

## 5. Run in parallel

```
[spawn] 8 hypothesis-runner subagents, fan-out...
[spawn] 1 adversary subagent, re-examining assumptions in parallel
```

*(each runs in its own subagent, writes isolated logs, returns a verdict)*

---

## 6. Survival table

```
hypothesis                                        verdict        evidence
─────────────────────────────────────────────────────────────────────────────
H1  off-by-one `<` vs `<=`                        SURVIVED       is_expired(now)==True, shouldn't be
H2  clock skew                                    KILLED         |Δ| = 0.0003s, within tolerance
H3  seconds vs milliseconds                       KILLED         both int, both epoch-seconds
H4  race on refresh/check                         KILLED         1000 concurrent runs, no inversion
H5  timezone bug                                  KILLED         both UTC, verified
H6  JWT rounding                                  KILLED         decoded==original for all 1000
A1  freeze-time boundary artifact                 INCONCLUSIVE   fails at ±1s too — not boundary
A2  stale cache                                   KILLED         flush made no difference

survivors: 1  (H1)
```

One survivor. Pipeline proceeds.

---

## 7. Propose fix — gate 1

```
[fix] survivor: H1. strictly one. refusal lifted.

        diff --git a/auth/session.py b/auth/session.py
        @@ -88,7 +88,7 @@
        -    return exp < now
        +    return exp <= now

[fix] patched. running repro loop...
[fix] 500/500 green. adversary re-check: still green.

Press Enter to promote this as a regression test, ^C to stop.
>
```

`Enter`.

---

## 8. Promote to regression

```
[promote] test added: auth/session_test.py::test_is_expired_boundary_inclusive
[promote] committed: "fix(auth): treat exp==now as expired"
done.
```

---

## What you actually got

- A **deterministic repro** you didn't have before.
- **Five hypotheses killed with evidence** — not just "I looked and it seemed fine."
- **One survivor**, with the experiment that proves it.
- A **regression test** that would have caught the bug on day one.
- A commit message that names the mechanism, not the symptom.

Total wall time on this bug: ~6 minutes. Previous engineer spent 2 days and added a retry.

---

## When the pipeline refuses to ship

If step 6 shows 0 or ≥2 survivors, the plugin **will not propose a fix**. It re-enters hypothesis generation with the survival evidence as new constraints. You will see:

```
survivors: 0  → generating 4 more hypotheses informed by what was ruled out
survivors: 2  → designing a discriminating experiment between H1 and H4
```

This is the feature. A single-survivor fix is a fix you can defend at a code review three months from now.

---

## Flags for this demo

```bash
# Full pipeline (what the transcript shows)
/god-of-debugger <bug>

# Skip both gates — CI-style autonomous run
/god-of-debugger --yolo <bug>

# Skip repro bootstrap; you already have one
/god-of-debugger --repro "pytest auth/session_test.py::test_refresh_near_expiry" <bug>
```

Fix-refusal (step 7 gate on survivor count) applies even with `--yolo`. That one never turns off.
