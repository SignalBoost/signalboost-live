#!/usr/bin/env bash
set -euo pipefail

repo="${GITHUB_REPOSITORY:-SignalBoost/signalboost-live}"
protected="${PROTECTED_RUN_IDS:-35666699786,35666699755}"

if ! command -v gh >/dev/null 2>&1; then
  echo "ERROR: GitHub CLI (gh) is required. Run this from a GitHub Codespace." >&2
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "ERROR: Node.js is required." >&2
  exit 1
fi

gh auth status >/dev/null

export GITHUB_REPOSITORY="$repo"
export GITHUB_TOKEN="$(gh auth token)"
# The cleanup script protects its own Actions run ID. A Codespace is not an
# Actions run, so use a harmless sentinel that cannot collide with a real run.
export GITHUB_RUN_ID="${GITHUB_RUN_ID:-999999999999}"
export PROTECTED_RUN_IDS="$protected"

echo "Repository: $GITHUB_REPOSITORY"
echo "Protected workflow run IDs: $PROTECTED_RUN_IDS"
echo "Cancelling only stale/superseded/deleted/closed-branch Actions runs..."
exec node .github/scripts/actions-backlog-self-heal.mjs
