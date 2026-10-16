#!/usr/bin/env bash
# End-to-end Ghidra installation verification for the isolated REA worker.
set -euo pipefail
ROOT="${GHIDRA_INSTALL_ROOT:-$HOME/.local/opt/ghidra}"
if [[ ! -f "$ROOT/support/analyzeHeadless" ]]; then
  echo "FAIL: Ghidra headless analyzer missing: $ROOT/support/analyzeHeadless" >&2; exit 1
fi
command -v java >/dev/null || { echo "FAIL: Java missing" >&2; exit 1; }
MAJOR="$(java -version 2>&1 | sed -n '1s/.*version "\([0-9]*\).*/\1/p')"
if [[ "$MAJOR" != "25" ]]; then
  echo "FAIL: Ghidra 12.1.4 requires configured Java 25; got ${MAJOR:-unknown}" >&2; exit 1
fi
if ! output="$(bash "$ROOT/support/analyzeHeadless" 2>&1)"; then
  # Ghidra prints usage and may return nonzero when no project supplied.
  if ! grep -Eqi 'analyzeHeadless|usage|headless' <<< "$output"; then
    echo "FAIL: analyzer could not start" >&2; printf '%s\n' "$output" >&2; exit 1
  fi
fi
if ! grep -Eqi 'analyzeHeadless|usage|headless' <<< "$output"; then
  echo "FAIL: missing recognizable analyzer startup output" >&2; printf '%s\n' "$output" >&2; exit 1
fi
echo "PASS: Ghidra headless CLI starts with configured Java 25 at $ROOT"
