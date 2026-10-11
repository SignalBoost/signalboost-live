#!/usr/bin/env bash
# Checks that cost nothing: provider connection metadata, cross-tenant denial, Supervisor exclusion, budget refusal, no graduation.
# Run AFTER customer A connected their keys in LAB. Never reads key values.
source "$(dirname "$0")/lib/common.sh"
need ORG_A ORG_B STAGING_DB_URL

# Provider connection (metadata only)
r=$(lab_api A GET "/api/lab/providers?organizationId=$ORG_A"); st=$(head -n1 <<<"$r"); body=$(sed 1d <<<"$r")
f=$(evidence providers-list-A <<<"$body")
teach=$(node -e 'const o=JSON.parse(process.argv[1]);const c=(o.credentials||[]).find(c=>c.providerKind!=="huggingface");console.log(c?c.id:"")' "$body" 2>/dev/null || true)
hf=$(node -e 'const o=JSON.parse(process.argv[1]);const c=(o.credentials||[]).find(c=>c.providerKind==="huggingface");console.log(c?c.id:"")' "$body" 2>/dev/null || true)
[[ "$st" == 200 && -n "$teach" && -n "$hf" ]] && { record PROVIDER_CONNECTED passed "Customer A has a teacher key and a Hugging Face token connected" "$f"; save_state TEACHER_CRED "$teach"; save_state HF_CRED "$hf"; } \
  || record PROVIDER_CONNECTED failed "Expected one teacher and one Hugging Face connection (HTTP $st)" "$f"
grep -Eq '"(secret|ciphertext)"' "$EVID/$f" && record PROVIDER_LIST_NO_SECRETS failed "Listing returns key material" "$f" || record PROVIDER_LIST_NO_SECRETS passed "Listing returns no key material" "$f"
# Keys stored encrypted, not plaintext
enc=$(psql_db -c "select count(*) filter (where ciphertext is not null and iv is not null and tag is not null), count(*) from lab.provider_credentials where organization_id='$ORG_A'")
[[ "${enc%|*}" == "${enc#*|}" && "${enc#*|}" -ge 2 ]] && record CREDENTIALS_ENCRYPTED passed "All of customer A's keys stored encrypted ($enc)" || record CREDENTIALS_ENCRYPTED failed "Encryption fields missing ($enc)"

# Cross-tenant denial: customer B against customer A's workspace
for kind in providers training; do
  p="/api/lab/$kind?organizationId=$ORG_A"; id="XTENANT_READ_${kind^^}"
  r=$(lab_api B GET "$p"); st=$(head -n1 <<<"$r"); f=$(evidence "xtenant-read-$kind" <<<"$(sed 1d <<<"$r")")
  [[ "$st" =~ ^(401|403|404)$ ]] && record "$id" passed "Other tenant refused reading A's $kind (HTTP $st)" "$f" || record "$id" failed "Other tenant got HTTP $st reading A's $kind" "$f"
done
r=$(lab_api B POST /api/lab/training "{\"organizationId\":\"$ORG_A\",\"experimentId\":\"${EXPERIMENT_A:-00000000-0000-0000-0000-000000000000}\",\"source\":\"examples\",\"computeCredentialId\":\"${HF_CRED:-}\",\"baseModel\":\"x\",\"approvedBudgetUsd\":1,\"maxHourlyUsd\":1,\"examples\":\"{}\"}")
st=$(head -n1 <<<"$r"); f=$(evidence xtenant-start <<<"$(sed 1d <<<"$r")")
[[ "$st" =~ ^(401|403|404)$ ]] && ! grep -q '"runId"' "$EVID/$f" && record XTENANT_START_DENIED passed "Other tenant cannot start training with A's keys (HTTP $st)" "$f" || record XTENANT_START_DENIED failed "Other tenant start returned HTTP $st; validation errors do not prove tenant authorization" "$f"

# Supervisor exclusion: no Supervisor role or code path can reach customer keys
roles=$(psql_db -c "select coalesce(string_agg(rolname,','),'') from pg_roles where rolname ilike '%supervisor%'")
bad=""
for r in ${roles//,/ }; do
  for t in lab.provider_credentials lab.customer_training_runs; do psql_db -c "select has_table_privilege('$r','$t','select')" | grep -q t && bad+="$r:$t "; done
  psql_db -c "select count(*) from pg_proc p where p.proname like 'itmounts_lab_customer_%' and has_function_privilege('$r',p.oid,'execute')" | grep -qv '^0$' && bad+="$r:customer_functions "
done
direct=$(psql_db -c "select string_agg(r||':'||has_table_privilege(r,'lab.provider_credentials','select'),' ') from unnest(array['anon','authenticated','service_role']) r")
printf 'supervisor_roles=%s\nviolations=%s\napp_role_direct_select=%s\n' "${roles:-none}" "${bad:-none}" "$direct" | evidence supervisor-db >/dev/null
[[ -z "$bad" && "$direct" != *true* ]] && record SUPERVISOR_DB_EXCLUDED passed "No Supervisor or app role can read stored keys directly" supervisor-db.txt || record SUPERVISOR_DB_EXCLUDED failed "Access found: $bad $direct" supervisor-db.txt
if [[ -n "${REPO_DIR:-}" ]]; then
  hits=$(grep -rlE "labCustomerCredentialVault|openCustomerCredential|lab\.provider_credentials" "$REPO_DIR/saas" --include=*.ts --include=*.tsx 2>/dev/null | grep -i supervisor || true)
  echo "${hits:-none}" | evidence supervisor-code >/dev/null
  [[ -z "$hits" ]] && record SUPERVISOR_CODE_EXCLUDED passed "No Supervisor code imports the customer key vault" supervisor-code.txt || record SUPERVISOR_CODE_EXCLUDED failed "Supervisor code touches customer keys" supervisor-code.txt
fi
record SUPERVISOR_MASTER_KEY_ISOLATION unverified "Known gap: the database owner plus VAULT_MASTER_KEY can still decrypt. Confirm Supervisor's runtime has neither (deployment check by a person)."

# Budget enforcement that costs nothing: requests that exceed the ceiling must be refused before any call.
if [[ -n "${EXPERIMENT_A:-}" && -n "${TEACHER_CRED:-}" && -n "${HF_CRED:-}" ]]; then
  r=$(lab_api A POST /api/lab/training "{\"organizationId\":\"$ORG_A\",\"experimentId\":\"$EXPERIMENT_A\",\"source\":\"teacher\",\"teacherCredentialId\":\"$TEACHER_CRED\",\"computeCredentialId\":\"$HF_CRED\",\"teacherModel\":\"${RATE_MODEL:-}\",\"baseModel\":\"${BASE_MODEL:-}\",\"approvedBudgetUsd\":0.01,\"teacherBudgetUsd\":5,\"maxHourlyUsd\":0.01,\"prompts\":\"Say hello.\"}")
  st=$(head -n1 <<<"$r"); f=$(evidence budget-over-ceiling <<<"$(sed 1d <<<"$r")")
  [[ "$st" =~ ^4 ]] && ! grep -q '"runId"' "$EVID/$f" && record BUDGET_CEILING_REFUSED passed "Teacher budget above the approved total was refused before any call (HTTP $st)" "$f" || record BUDGET_CEILING_REFUSED failed "Over-ceiling request was not refused (HTTP $st)" "$f"
  r=$(lab_api A POST /api/lab/training "{\"organizationId\":\"$ORG_A\",\"experimentId\":\"$EXPERIMENT_A\",\"source\":\"teacher\",\"teacherCredentialId\":\"$TEACHER_CRED\",\"computeCredentialId\":\"$HF_CRED\",\"teacherModel\":\"model-without-verified-price\",\"baseModel\":\"${BASE_MODEL:-}\",\"approvedBudgetUsd\":0.01,\"teacherBudgetUsd\":0.005,\"maxHourlyUsd\":0.01,\"prompts\":\"Say hello.\"}")
  st=$(head -n1 <<<"$r"); f=$(evidence budget-unverified-price <<<"$(sed 1d <<<"$r")")
  record BUDGET_UNPRICED_REFUSED unverified "One-prompt request cannot prove rate-card enforcement; run the supplied rollback database test and a valid staging request" "$f"
else
  record BUDGET_CEILING_REFUSED unverified "Set EXPERIMENT_A (from LAB) and connect keys first"
fi

# No graduation or certification
record NO_GRADUATION_FOR_ACCESS unverified "Confirmed only after 04-paid-run downloads succeed for a customer with no graduation or certification records"
