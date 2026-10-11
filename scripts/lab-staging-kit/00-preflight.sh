#!/usr/bin/env bash
# Records the deployed commit and staging URL. No database writes, no paid calls.
source "$(dirname "$0")/lib/common.sh"
need_tool psql curl node git sha256sum
need STAGING_APP_URL STAGING_SUPABASE_URL STAGING_DB_URL REPO_DIR
assert_staging
SHA=$(git -C "$REPO_DIR" rev-parse HEAD); save_state REPO_SHA "$SHA"; save_state STAGING_URL "$STAGING_APP_URL"
dirty=$(git -C "$REPO_DIR" status --porcelain | wc -l)
[[ "$dirty" == 0 ]] && record PREFLIGHT_CLEAN_TREE passed "Repository has no uncommitted changes at $SHA" \
  || record PREFLIGHT_CLEAN_TREE failed "$dirty uncommitted files; the tested code would not match the commit SHA"
# Every v6 file present at its original path with the fingerprint listed in CHANGES.md
if [[ -f "$KIT_DIR/v6-fingerprints.txt" ]]; then
  ( cd "$REPO_DIR" && sha256sum -c "$KIT_DIR/v6-fingerprints.txt" ) > /tmp/v6check.txt 2>&1 && \
    record PREFLIGHT_V6_FILES passed "All v6 files match their fingerprints" "$(evidence v6-fingerprints < /tmp/v6check.txt)" || \
    record PREFLIGHT_V6_FILES failed "Some v6 files are missing or differ" "$(evidence v6-fingerprints < /tmp/v6check.txt)"
fi
# Deployed app must answer; the telemetry page is where the panel is mounted.
code=$(curl -s -o /dev/null -w '%{http_code}' "$STAGING_APP_URL/dashboard/cos-university-telemetry")
[[ "$code" =~ ^(200|302|307)$ ]] && record PREFLIGHT_APP_UP passed "Telemetry page responded $code" || record PREFLIGHT_APP_UP failed "Telemetry page responded $code"
psql_db -c "select 1" >/dev/null && record PREFLIGHT_DB_REACHABLE passed "Staging database reachable" || record PREFLIGHT_DB_REACHABLE failed "Cannot reach staging database"
record DEPLOYED_REVISION unverified "Repository commit $SHA; independently confirm the running deployment revision"
echo "Repository commit: $SHA"
