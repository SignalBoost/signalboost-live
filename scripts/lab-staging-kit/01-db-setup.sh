#!/usr/bin/env bash
# DATABASE SETUP ONLY. Applies migrations and creates two disposable customers. Makes NO provider or Hugging Face calls.
source "$(dirname "$0")/lib/common.sh"
need STAGING_DB_URL STAGING_SUPABASE_URL STAGING_SERVICE_ROLE_KEY REPO_DIR CUSTOMER_A_EMAIL CUSTOMER_A_PASSWORD CUSTOMER_B_EMAIL CUSTOMER_B_PASSWORD
assert_staging
# Apply the intended migrations using your approved staging deployment process first.
# This kit checks migration versions; it never pushes unrelated repository migrations.
# Supabase MCP applies migrations under generated versions. Verify the reviewed
# migration identity by its recorded name as well as the original file version.
# Neither a version alone nor a name alone proves runtime readiness: the RPC
# and grant checks below must still pass.
psql_db -c "select version || '|' || coalesce(name,'') from supabase_migrations.schema_migrations order by version" > "$EVID/applied-migrations.txt"
missing_migrations=0
for spec in '20261009001500|lab_owner_org_provisioning|lab_customer_workspace_provisioning' '20261011225542|lab_customer_workspace_provisioning|lab_customer_workspace_provisioning' '20261012000000|lab_customer_provider_credentials_and_training|lab_customer_provider_credentials_and_training' '20261012010000|lab_customer_teacher_spend|lab_customer_teacher_spend'; do
  version="${spec%%|*}"
  aliases="${spec#*|}"
  name="${aliases%%|*}"
  alternate="${aliases#*|}"
  if grep -Eq "^(${version}\\|[^|]*|[0-9]{14}\\|(${name}|${alternate}))$" "$EVID/applied-migrations.txt"; then
    record "DB_MIGRATION_$version" passed "Expected migration identity recorded; runtime validation follows" applied-migrations.txt
  else
    record "DB_MIGRATION_$version" failed "Expected reviewed migration identity missing" applied-migrations.txt
    missing_migrations=1
  fi
done
[[ "$missing_migrations" == 0 ]] || { echo "Apply the required staging migrations first." >&2; exit 1; }
# Verify the actual installed functions and role grants, not only migration history.
for spec in 'public.itmounts_lab_experiment_start_options(uuid)|service_role' 'public.itmounts_lab_customer_initialize_workspace(text)|authenticated' 'public.itmounts_lab_customer_list_credentials(uuid)|authenticated'; do
  signature="${spec%%|*}"; role="${spec##*|}"
  result=$(psql_db -v signature="$signature" -v role="$role" <<'SQL'
select case
  when to_regprocedure(:'signature') is null then 'missing'
  when not has_function_privilege(:'role', to_regprocedure(:'signature'), 'EXECUTE') then 'permission_denied'
  else 'ready'
end;
SQL
)
  check_id="DB_REQUIRED_RPC_$(printf '%s' "$signature" | tr -c '[:alnum:]' '_')"
  if [[ "$result" == "ready" ]]; then
    record "$check_id" passed "$signature executable by $role"
  else
    record "$check_id" failed "$signature: $result for $role"
    exit 1
  fi
done

# 2. Disposable customers (A = test customer, B = other tenant for cross-tenant checks). Admin API; passwords come from your env.
mkuser() { python3 "$KIT_DIR/lib/safe_io.py" create-user "$1"; }
for who in A B; do
  id=$(mkuser $who)
  if [[ -z "$id" ]]; then e="CUSTOMER_${who}_EMAIL"; id=$(printf "select id from auth.users where email = :'em';\n" | psql_db -v em="${!e}"); fi
  [[ -n "$id" ]] && save_state "CUSTOMER_${who}_USER_ID" "$id" || { record "DB_CUSTOMER_${who}" failed "Could not create disposable customer $who"; exit 1; }
done
record DB_DISPOSABLE_CUSTOMERS passed "Two disposable customers exist (ids in state.env)"

# 3. Workspace created twice returns the same workspace (calls the provisioning function as the server does: service role over the Data API).
prov() { python3 "$KIT_DIR/lib/safe_io.py" provision "$1" "$2"; }
a1=$(prov "$CUSTOMER_A_USER_ID" "LAB staging customer A"); a2=$(prov "$CUSTOMER_A_USER_ID" "LAB staging customer A")
b1=$(prov "$CUSTOMER_B_USER_ID" "LAB staging customer B")
printf 'first=%s\nsecond=%s\nother_tenant=%s\n' "$a1" "$a2" "$b1" | evidence workspace-idempotency >/dev/null
if [[ "$a1" =~ ^[0-9a-f-]{36}$ && "$a1" == "$a2" ]]; then record WORKSPACE_IDEMPOTENT passed "Creating the workspace twice returned the same workspace" workspace-idempotency.txt
else record WORKSPACE_IDEMPOTENT failed "Workspace calls returned different or invalid results" workspace-idempotency.txt; fi
[[ "$a1" =~ ^[0-9a-f-]{36}$ && "$b1" =~ ^[0-9a-f-]{36}$ && "$a1" != "$b1" ]] || exit 1
save_state ORG_A "$a1"; save_state ORG_B "$b1"
cnt=$(psql_db -c "select count(*) from lab.organization_members where user_id='$CUSTOMER_A_USER_ID' and role='owner'")
[[ "$cnt" == 1 ]] && record WORKSPACE_SINGLE_MEMBERSHIP passed "Exactly one owner membership for customer A" || record WORKSPACE_SINGLE_MEMBERSHIP failed "Customer A has $cnt owner memberships"
# 4. No graduation / certification rows are created or required for this customer.
grad=$(psql_db -c "select count(*) from information_schema.tables where table_schema='lab' and table_name ~ '(graduat|certif)'")
save_state GRAD_TABLES "$grad"
echo "Database setup done. Next: 02-rate-card.sh, then have the customer connect keys in LAB (CUSTOMER-KEYS-IN-LAB.md)."
