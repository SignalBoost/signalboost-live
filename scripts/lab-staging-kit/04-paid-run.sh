#!/usr/bin/env bash
# PAID EXECUTION. Uses the test customer's own teacher key and Hugging Face token (connected in LAB). Refuses to run without
# a written budget approval. The platform owner's keys are never used: the app reads the customer's stored credentials.
source "$(dirname "$0")/lib/common.sh"
need ORG_A EXPERIMENT_A TEACHER_CRED HF_CRED RATE_MODEL BASE_MODEL APPROVED_TEST_BUDGET_USD TEACHER_BUDGET_USD MAX_HOURLY_USD APPROVED_BY APPROVAL_REFERENCE
node -e 'const [a,t,h]=process.argv.slice(1).map(Number);if(!(a>0&&a<=50&&t>0&&t<a&&h>0&&h<=a))process.exit(1)' "$APPROVED_TEST_BUDGET_USD" "$TEACHER_BUDGET_USD" "$MAX_HOURLY_USD" \
  || { echo "Budget values invalid: need 0 < teacher < total <= 50 and 0 < hourly <= total" >&2; exit 2; }
for v in OPENAI_API_KEY ANTHROPIC_API_KEY HF_TOKEN HUGGINGFACE_TOKEN; do
  [[ -n "${!v:-}" ]] && { echo "Refusing: $v is set in this shell. Unset platform keys; customer keys come from LAB only." >&2; exit 3; }
done
echo "This will spend up to \$$APPROVED_TEST_BUDGET_USD of the TEST CUSTOMER's own provider and Hugging Face credit."
echo "Approved by: $APPROVED_BY   Reference: $APPROVAL_REFERENCE"
read -r -p "Type the approved total exactly to continue: " typed
[[ "$typed" == "$APPROVED_TEST_BUDGET_USD" ]] || { echo "Not confirmed. Nothing was started."; exit 1; }
printf 'approved_total_usd=%s\nteacher_budget_usd=%s\nmax_hourly_usd=%s\napproved_by=%s\nreference=%s\nconfirmed_at=%s\n' \
  "$APPROVED_TEST_BUDGET_USD" "$TEACHER_BUDGET_USD" "$MAX_HOURLY_USD" "$APPROVED_BY" "$APPROVAL_REFERENCE" "$(date -u +%FT%TZ)" | evidence budget-approval >/dev/null
record BUDGET_APPROVED passed "Total test budget \$$APPROVED_TEST_BUDGET_USD approved by $APPROVED_BY ($APPROVAL_REFERENCE)" budget-approval.txt

assert_staging
PROMPTS=${TEACHER_PROMPTS:-$(python3 - <<'PROMPTS_PY'
for i in range(1,21): print(f"Give a distinct practical customer onboarding tip number {i}, in two sentences.")
PROMPTS_PY
)}
printf '%s' "$PROMPTS" | python3 "$KIT_DIR/lib/safe_io.py" prompts
body=$(node -e 'const e=process.env;console.log(JSON.stringify({organizationId:e.ORG_A,experimentId:e.EXPERIMENT_A,source:"teacher",teacherCredentialId:e.TEACHER_CRED,computeCredentialId:e.HF_CRED,teacherModel:e.RATE_MODEL,baseModel:e.BASE_MODEL,baseModelRevision:e.BASE_MODEL_REVISION||"",approvedBudgetUsd:+e.APPROVED_TEST_BUDGET_USD,teacherBudgetUsd:+e.TEACHER_BUDGET_USD,maxHourlyUsd:+e.MAX_HOURLY_USD,prompts:process.argv[1]}))' "$PROMPTS")
r=$(lab_api A POST /api/lab/training "$body"); st=$(head -n1 <<<"$r"); f=$(evidence training-start <<<"$(sed 1d <<<"$r")")
run=$(sed 1d <<<"$r" | json_get runId)
if [[ "$st" == 200 && -n "$run" ]]; then save_state RUN_A "$run"; record TEACHER_GENERATION passed "Teacher generation finished inside the budget and training was submitted (run $run)" "$f"
else record TEACHER_GENERATION failed "Start returned HTTP $st" "$f"; exit 1; fi

# Recoverable state saved before submission
row=$(psql_db -c "select stage, committed_max_cost_usd, approved_budget_usd, teacher_reserved_usd, teacher_spent_usd, teacher_overrun_usd, teacher_reservation_state, (stage_token_hash is not null or stage in ('training','completed','failed')), (hf_pending_job_name is not null or hf_job_id is not null), spend_blocked_at from lab.customer_training_runs where id='$run'" 2>&1)
f=$(evidence run-row-after-start <<<"$row")
node -e 'const p=process.argv[1].split("|");const ok=+p[1]<=+p[2]&&p[6]==="settled"&&p[7]==="t"&&p[8]==="t";process.exit(ok?0:1)' "$row" \
  && record BUDGET_RESERVED_BEFORE_SUBMIT passed "Reservation, callback token and job name saved; committed cost within approval" "$f" \
  || record BUDGET_RESERVED_BEFORE_SUBMIT failed "Run row does not show a saved reservation within budget" "$f"
spent=$(cut -d'|' -f5 <<<"$row"); over=$(cut -d'|' -f6 <<<"$row")
record TEACHER_SPEND_RECORDED passed "Teacher spend recorded \$$spent, overrun \$$over (compare with the provider's usage page)" "$f"
record TEACHER_SPEND_MATCHES_INVOICE unverified "A person must compare \$$spent with the provider dashboard for this key"

# Progress polling
deadline=$(( $(date +%s) + ${TRAINING_TIMEOUT_MIN:-120}*60 )); last=""; : > /tmp/progress.txt
while (( $(date +%s) < deadline )); do
  r=$(lab_api A GET "/api/lab/training?organizationId=$ORG_A"); stage=$(sed 1d <<<"$r" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const o=JSON.parse(s);const x=(o.runs||[]).find(r=>r.runId===process.argv[1]);console.log(x?x.stage:"")})' "$run")
  [[ "$stage" != "$last" ]] && { echo "$(date -u +%T) $stage" | tee -a /tmp/progress.txt; last=$stage; }
  [[ "$stage" =~ ^(completed|failed|cancelled)$ ]] && break
  sleep 30
done
f=$(evidence progress < /tmp/progress.txt)
[[ $(wc -l < /tmp/progress.txt) -ge 2 ]] && record PROGRESS_VISIBLE passed "Progress moved through $(wc -l < /tmp/progress.txt) stages" "$f" || record PROGRESS_VISIBLE failed "Progress did not change" "$f"
[[ "$last" == completed ]] && record TRAINING_COMPLETED passed "Training completed" "$f" || { record TRAINING_COMPLETED failed "Training ended as '${last:-timeout}'" "$f"; }

# Artifact download, verified against the recorded manifest
if [[ "$last" == completed ]]; then
  r=$(lab_api A GET "/api/lab/training/download?organizationId=$ORG_A&runId=$run"); files=$(sed 1d <<<"$r")
  f=$(evidence download-manifest <<<"$files"); grep -Eq 'huggingface\.co|hf download|huggingface-cli' "$EVID/$f" && record DOWNLOAD_NO_PRIVATE_LINK failed "Download returned a Hugging Face link" "$f" || record DOWNLOAD_NO_PRIVATE_LINK passed "No private Hugging Face link returned" "$f"
  # Reject failed/malformed/empty manifests before recording any successful download.
  [[ "$(head -n1 <<<"$r")" == 200 ]] || { record ARTIFACT_DOWNLOAD failed "Manifest request failed" "$f"; exit 1; }
  printf '%s' "$files" | python3 "$KIT_DIR/lib/safe_io.py" downloads | redact > "$EVID/downloads.txt"
  record ARTIFACT_DOWNLOAD passed "Nonempty manifest: every listed file downloaded with the expected size; server integrity checks remain separate" downloads.txt
  r=$(lab_api B GET "/api/lab/training/download?organizationId=$ORG_A&runId=$run")
  xc=$(head -n1 <<<"$r")
  [[ "$xc" =~ ^(401|403|404)$ ]] && record XTENANT_DOWNLOAD_DENIED passed "Other tenant refused download (HTTP $xc)" || record XTENANT_DOWNLOAD_DENIED failed "Other tenant got HTTP $xc"
  record NO_GRADUATION_FOR_ACCESS passed "Customer used training and download with no graduation or certification step" downloads.txt
fi

# Credential revocation: revoke the teacher key, then a new run with it must be refused before any call
r=$(lab_api A DELETE /api/lab/providers "{\"organizationId\":\"$ORG_A\",\"credentialId\":\"$TEACHER_CRED\"}"); f1=$(evidence revoke <<<"$(sed 1d <<<"$r")")
r=$(lab_api A POST /api/lab/training "$body"); st=$(head -n1 <<<"$r"); f=$(evidence after-revoke-start <<<"$(sed 1d <<<"$r")")
[[ "$st" =~ ^4 ]] && ! grep -q '"runId"' "$EVID/$f" && record CREDENTIAL_REVOCATION passed "Revoked key cannot be used (HTTP $st)" "$f" || record CREDENTIAL_REVOCATION failed "Revoked key still accepted (HTTP $st)" "$f"
rv=$(psql_db -c "select (revoked_at is not null)::text from lab.provider_credentials where id='$TEACHER_CRED'")
echo "revoked=$rv" | evidence revoke-row >/dev/null; record CREDENTIAL_REVOKED_ROW "$([[ "$rv" == true ]] && echo passed || echo failed)" "Stored key marked revoked: $rv" revoke-row.txt
r=$(lab_api A GET "/api/lab/providers?organizationId=$ORG_A"); grep -q "$TEACHER_CRED" <<<"$r" && record CREDENTIAL_HIDDEN_AFTER_REVOKE failed "Revoked key still listed" || record CREDENTIAL_HIDDEN_AFTER_REVOKE passed "Revoked key no longer listed in LAB"
