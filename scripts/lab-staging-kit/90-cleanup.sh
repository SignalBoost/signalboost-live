#!/usr/bin/env bash
# Removes the disposable customers and their workspaces. Price entry is kept unless REMOVE_RATE_CARD=1.
source "$(dirname "$0")/lib/common.sh"
need STAGING_DB_URL STAGING_SUPABASE_URL STAGING_SERVICE_ROLE_KEY
assert_staging
read -r -p "Delete disposable customers A and B and their LAB data on STAGING? (yes/no) " a; [[ "$a" == yes ]] || exit 0
for who in A B; do id_var="CUSTOMER_${who}_USER_ID"; [[ -n "${!id_var:-}" ]] || continue
  python3 "$KIT_DIR/lib/safe_io.py" delete-user "${!id_var}" >/dev/null
done
echo "Customers removed. Delete their Hugging Face repos/jobs from the test customer's HF account and revoke the test keys at each provider."
