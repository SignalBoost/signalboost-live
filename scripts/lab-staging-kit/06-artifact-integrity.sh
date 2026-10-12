#!/usr/bin/env bash
# Phase 2: inspect a completed customer-owned artifact. No provider calls or expenditure.
source "$(dirname "$0")/lib/common.sh"
need ORG_A STAGING_DB_URL
[[ -n "${RUN_A:-}" ]] || { echo "RUN_A required; complete approved training first" >&2; exit 2; }
r1=$(lab_api A GET "/api/lab/training/download?organizationId=$ORG_A&runId=$RUN_A")
r2=$(lab_api A GET "/api/lab/training/download?organizationId=$ORG_A&runId=$RUN_A")
s1=$(head -n1 <<<"$r1"); s2=$(head -n1 <<<"$r2")
b1=$(sed 1d <<<"$r1"); b2=$(sed 1d <<<"$r2")
f=$(evidence artifact-manifest <<<$'first:\n'"$b1"$'\nsecond:\n'"$b2")
if [[ "$s1" == 200 && "$s2" == 200 && "$b1" == "$b2" && -n "$(json_get revision <<<"$b1")" ]]; then
  record ARTIFACT_IDENTITY_DETERMINISTIC unverified "Repeated manifests agree; independent byte/hash verification is still required" "$f"
else
  record ARTIFACT_IDENTITY_DETERMINISTIC failed "Missing, unpinned, or inconsistent manifests (HTTP $s1/$s2)" "$f"
fi
row=$(psql_db -c "select (base_model is not null), (artifact_revision is not null), (committed_max_cost_usd is not null), (stage='completed') from lab.customer_training_runs where id='$RUN_A'" 2>/dev/null || true)
fr=$(evidence lineage <<<"$row")
[[ "$row" == "t|t|t|t" ]] && record LINEAGE_RECORDED passed "Run links base model, pinned artifact, cost bound, and completion" "$fr" || record LINEAGE_RECORDED failed "Run lineage incomplete: $row" "$fr"
manifest=$(psql_db -c "select coalesce(artifact_files::text,'') from lab.customer_training_runs where id='$RUN_A'" 2>/dev/null || true)
fm=$(evidence artifact-files <<<"$manifest")
if grep -Eq 'sha256|sha1|"hash"' <<<"$manifest"; then
  record ARTIFACT_HASH_RECORDED unverified "Manifest includes hash metadata; compare actual downloaded bytes to every expected digest" "$fm"
else
  record ARTIFACT_HASH_RECORDED failed "No hash metadata in artifact manifest" "$fm"
fi
record ARTIFACT_BIRTH_CERTIFICATE unverified "Require public-key signature and independent verification of exact artifact certificate"
record EVALUATION_GATE unverified "Independently demonstrate a bad artifact is rejected by evaluator"
record PRIVACY_ROLLBACK unverified "Exercise privacy boundary and artifact rollback using authorized staging operator procedure"
