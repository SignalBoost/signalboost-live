#!/usr/bin/env bash
# DATABASE SETUP ONLY. Applies migrations and creates two disposable customers. Makes NO provider or Hugging Face calls.
source "$(dirname "$0")/lib/common.sh"
need STAGING_DB_URL STAGING_SUPABASE_URL STAGING_SERVICE_ROLE_KEY REPO_DIR CUSTOMER_A_EMAIL CUSTOMER_A_PASSWORD CUSTOMER_B_EMAIL CUSTOMER_B_PASSWORD
assert_staging
# Apply the intended migrations using your approved staging deployment process first.
# This kit checks migration versions; it never pushes unrelated repository migrations.
psql_db -c "select version from supabase_migrations.schema_migrations order by version" > /tmp/mig.txt
cp /tmp/mig.txt "$EVID/applied-migrations.txt"
missing_migrations=0
for v in 20261009001500 20261011225542 20261012000000 20261012010000; do
  grep -qx "$v" /tmp/mig.txt && record "DB_MIGRATION_$v" passed "Migration $v is applied" applied-migrations.txt \
    || { record "DB_MIGRATION_$v" failed "Migration $v is NOT applied" applied-migrations.txt; missing_migrations=1; }
done

[[ "$missing_migrations" == 0 ]] || { echo "Apply the required staging migrations first." >&2; exit 1; }
# Ensure required RPC signatures exist before disposable customer creation.
for signature in 'public.itmounts_lab_experiment_start_options(uuid)' 'public.itmounts_lab_customer_initialize_workspace(text)' 'public.itmounts_lab_customer_list_credentials(uuid)'; do
  installed=$(psql_db -v signature="$signature" -c "select coalesce(to_regprocedure(:'signature')::text, 'missing')")
  [[ "$installed" != "missing" ]] && record DB_REQUIRED_RPC passed "$signature exists" || { record DB_REQUIRED_RPC failed "$signature missing"; exit 1; }
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
