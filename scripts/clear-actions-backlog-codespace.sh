#!/usr/bin/env bash
set -euo pipefail

repo="${GITHUB_REPOSITORY:-SignalBoost/signalboost-live}"
owner="${repo%%/*}"
protected_csv="${PROTECTED_RUN_IDS:-35666699786,35666699755}"

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

declare -A protected=()
IFS=',' read -ra protected_ids <<< "$protected_csv"
for id in "${protected_ids[@]}"; do
  id="${id//[[:space:]]/}"
  [[ -n "$id" ]] && protected["$id"]=1
done

declare -A branch_tip_cache=()
declare -A open_pr_cache=()

encode_ref() {
  jq -nr --arg v "$1" '$v|@uri'
}

branch_tip() {
  local branch="$1"
  if [[ -v "branch_tip_cache[$branch]" ]]; then
    printf '%s' "${branch_tip_cache[$branch]}"
    return
  fi

  local encoded tip
  encoded="$(encode_ref "$branch")"
  if tip="$(gh api "repos/$repo/git/ref/heads/$encoded" --jq '.object.sha' 2>/dev/null)"; then
    branch_tip_cache["$branch"]="$tip"
  else
    branch_tip_cache["$branch"]="__MISSING__"
  fi
  printf '%s' "${branch_tip_cache[$branch]}"
}

has_open_pr() {
  local branch="$1"
  if [[ -v "open_pr_cache[$branch]" ]]; then
    [[ "${open_pr_cache[$branch]}" == "1" ]]
    return
  fi

  local count
  count="$(gh api -X GET "repos/$repo/pulls" -f state=open -f head="$owner:$branch" -f per_page=1 --jq 'length')"
  if [[ "$count" -gt 0 ]]; then
    open_pr_cache["$branch"]=1
    return 0
  fi
  open_pr_cache["$branch"]=0
  return 1
}

is_ephemeral() {
  [[ "$1" =~ ^(fix|feat|ci|mcp|ops|chore|test|hotfix|repair|refactor|ai|codex)/ ]] || [[ "$1" =~ ^SignalBoost/patch- ]]
}

cancel_run() {
  local id="$1" reason="$2" name="$3" branch="$4"
  if gh api -X POST "repos/$repo/actions/runs/$id/cancel" >/dev/null 2>&1; then
    printf 'cancelled %s | %s | %s | %s\n' "$id" "$reason" "$branch" "$name"
    return 0
  fi
  printf 'skipped/raced %s | %s | %s\n' "$id" "$branch" "$name"
}

collect_runs() {
  local status="$1"
  gh api --paginate -X GET "repos/$repo/actions/runs" -f status="$status" -f per_page=100 \
    --jq '.workflow_runs[] | [.id, .name, (.head_branch // ""), (.head_sha // "")] | @tsv'
}

echo "Repository: $repo"
echo "Current main: $main_sha"
echo "Protected run IDs: $protected_csv"

while IFS=$'\t' read -r id name branch head_sha; do
  [[ -z "$id" ]] && continue

  if [[ -v "protected[$id]" ]]; then
    printf 'preserved %s | protected | %s\n' "$id" "$name"
    continue
  fi
  if [[ "$head_sha" == "$main_sha" ]]; then
    printf 'preserved %s | current main | %s\n' "$id" "$name"
    continue
  fi

  if [[ "$branch" == "main" ]]; then
    cancel_run "$id" "stale_main_revision" "$name" "$branch"
    continue
  fi
  if [[ -z "$branch" ]]; then
    printf 'preserved %s | unknown branch | %s\n' "$id" "$name"
    continue
  fi

  tip="$(branch_tip "$branch")"
  if [[ "$tip" == "__MISSING__" ]]; then
    cancel_run "$id" "deleted_branch" "$name" "$branch"
    continue
  fi
  if [[ "$tip" != "$head_sha" ]]; then
    cancel_run "$id" "superseded_branch_revision" "$name" "$branch"
    continue
  fi
  if is_ephemeral "$branch" && ! has_open_pr "$branch"; then
    cancel_run "$id" "closed_or_merged_ephemeral_branch" "$name" "$branch"
    continue
  fi

  printf 'preserved %s | current live branch tip | %s | %s\n' "$id" "$branch" "$name"
done < <({ collect_runs queued; collect_runs in_progress; } | sort -n -k1,1 -u)
