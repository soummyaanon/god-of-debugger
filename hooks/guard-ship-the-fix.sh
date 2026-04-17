#!/usr/bin/env bash
# guard-ship-the-fix.sh
#
# PostToolUse hook for god-of-debugger.
#
# Rule: while an active debugging session has != 1 surviving hypothesis,
# block edits to production files. Allowlist:
#   1. Anything under .god-of-debugger/**
#   2. Files opened with a @god-of-debugger:probe marker comment
#   3. Test files (path heuristic)
#
# Session pointer lives at .god-of-debugger/current (plain text session_id).
# Session state lives at .god-of-debugger/sessions/<session_id>.json with:
#   { "survivors": ["H2"], "status": "open|closed|repro_unstable", ... }
#
# If no active session, hook is a no-op.
# If the session is closed or repro_unstable, hook is a no-op (user handles).

set -euo pipefail

input=$(cat)

pointer=".god-of-debugger/current"
[[ -f "$pointer" ]] || exit 0

session_id=$(tr -d '[:space:]' < "$pointer")
[[ -n "$session_id" ]] || exit 0

state_file=".god-of-debugger/sessions/${session_id}.json"
[[ -f "$state_file" ]] || exit 0

status=$(jq -r '.status // "open"' "$state_file" 2>/dev/null || echo "open")
case "$status" in
  closed|repro_unstable) exit 0 ;;
esac

file_path=$(printf '%s' "$input" | jq -r '.tool_input.file_path // .tool_input.path // empty')
[[ -n "$file_path" ]] || exit 0

# Allow anything under the plugin's working dir.
case "$file_path" in
  *".god-of-debugger/"*) exit 0 ;;
esac

# Allow test files (heuristic).
case "$file_path" in
  *test*|*spec*|*__tests__*|*.test.*|*.spec.*|*_test.go|*_test.py|*test_*.py)
    exit 0
    ;;
esac

# Allow files carrying a probe marker. Matches any line containing
# "@god-of-debugger:probe" anywhere (works across comment syntaxes).
if [[ -f "$file_path" ]] && grep -q "@god-of-debugger:probe" "$file_path" 2>/dev/null; then
  exit 0
fi

survivor_count=$(jq -r '(.survivors // []) | length' "$state_file" 2>/dev/null || echo 0)

if [[ "$survivor_count" != "1" ]]; then
  survivors=$(jq -r '(.survivors // []) | join(", ")' "$state_file" 2>/dev/null || echo "")
  {
    echo "god-of-debugger: BLOCKED edit to production file '$file_path'."
    echo "Session: $session_id"
    echo "Reason: $survivor_count hypotheses are currently alive (survivors: [$survivors])."
    echo ""
    echo "You may not ship a fix until exactly one hypothesis survives."
    echo "Next steps:"
    echo "  1. Design a discriminating experiment for the survivors."
    echo "  2. Run /god-of-debugger:run again."
    echo "  3. Once exactly one hypothesis survives, run /god-of-debugger:promote."
    echo "  4. Then you may edit production code."
    echo ""
    echo "Allowlist: test files, .god-of-debugger/**, and files containing a"
    echo "'@god-of-debugger:probe' marker comment are always editable."
  } >&2
  exit 2
fi

exit 0
