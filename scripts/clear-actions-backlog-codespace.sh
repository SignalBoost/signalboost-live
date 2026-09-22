#!/usr/bin/env bash
set -euo pipefail

repo="${GITHUB_REPOSITORY:-SignalBoost/signalboost-live}"
parallelism="${CANCEL_PARALLELISM:-20}"
protected_csv="${PROTECTED_RUN_IDS:-}"

if ! command -v gh >/dev/null 2>&1; then
  echo "ERROR: GitHub CLI (gh) is required. Run this from a GitHub Codespace." >&2
  exit 1
fi
if ! command -v jq >/dev/null 2>&1; then
  echo "ERROR: jq is required." >&2
  exit 1
fi

gh auth status >/dev/null
main_sha="$(gh api "repos/$repo/git/ref/heads/main" --jq '.object.sha')"

declare -A protected_ids=()
IFS=',' read -ra raw_protected <<< "$protected_csv"
for id in "${raw_protected[@]}"; do
  id="${id//[[:space:]]/}"
  [[ -n "$id" ]] && protected_ids["$id"]=1
done

declare -A protected_shas=()
protected_shas["$main_sha"]=1
while IFS= read -r sha; do
  [[ -n "$sha" ]] && protected_shas["$sha"]=1
done < <(gh api --paginate -X GET "repos/$repo/pulls" -f state=open -f per_page=100 --jq '.[].head.sha')

collect_runs() {
  local status="$1"
  gh api --paginate -X GET "repos/$repo/actions/runs" -f status="$status" -f per_page=100 \
    --jq '.workflow_runs[] | [.id, .name, (.head_branch // ""), (.head_sha // "")] | @tsv'
}

candidate_file="$(mktemp)"
trap 'rm -f "$candidate_file"' EXIT

echo "Repository: $repo"
echo "Current main: $main_sha"
echo "Protected run IDs: ${protected_csv:-none}"
echo "Protected SHAs: ${#protected_shas[@]} (current main + open PR heads)"
echo "Cancellation parallelism: $parallelism"

while IFS=$'\t' read -r id name branch head_sha; do
  [[ -z "$id" ]] && continue

  if [[ -v "protected_ids[$id]" ]]; then
    printf 'preserved %s | explicit protected run | %s\n' "$id" "$name"
    continue
  fi
  if [[ -z "$head_sha" ]]; then
    printf 'preserved %s | missing head SHA | %s\n' "$id" "$name"
    continue
  fi
  if [[ -v "protected_shas[$head_sha]" ]]; then
    printf 'preserved %s | current main/open PR head | %s | %s\n' "$id" "$branch" "$name"
    continue
  fi

  printf '%s\t%s\t%s\n' "$id" "$branch" "$name" >> "$candidate_file"
done < <({ collect_runs queued; collect_runs in_progress; } | sort -n -k1,1 -u)

candidate_count="$(wc -l < "$candidate_file" | tr -d ' ')"
echo "Cancellation candidates: $candidate_count"

if [[ "$candidate_count" -gt 0 ]]; then
  cancel_one() {
    local id="$1" branch="$2" name="$3"
    if gh api -X POST "repos/$repo/actions/runs/$id/cancel" >/dev/null 2>&1; then
      printf 'cancelled %s | %s | %s\n' "$id" "$branch" "$name"
    else
      printf 'skipped/raced %s | %s | %s\n' "$id" "$branch" "$name"
    fi
  }

  active=0
  while IFS=$'\t' read -r id branch name; do
    cancel_one "$id" "$branch" "$name" &
    active=$((active + 1))
    if (( active >= parallelism )); then
      wait
      active=0
    fi
  done < "$candidate_file"
  wait
fi

echo "Bulk cancellation pass complete."

if [[ "${REDISPATCH_MCP_ACCEPTANCE:-true}" == "true" ]]; then
  echo "Starting fresh MCP acceptance runs on current main..."
  gh workflow run playwright-mcp-live-acceptance.yml --repo "$repo" --ref main \
    || echo "WARNING: could not dispatch Playwright MCP acceptance"
  gh workflow run chrome-devtools-mcp-live-acceptance.yml --repo "$repo" --ref main \
    || echo "WARNING: could not dispatch Chrome DevTools MCP acceptance"
  echo "MCP acceptance dispatch step complete."
fi
