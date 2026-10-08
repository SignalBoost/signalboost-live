#!/usr/bin/env bash
# Transactional Phase 4 acceptance. Run ONLY on the isolated CI PostgreSQL database.
set -euo pipefail
export PGOPTIONS="-c statement_timeout=15000"
org=$(cat /proc/sys/kernel/random/uuid)
university=$(cat /proc/sys/kernel/random/uuid)
project=$(cat /proc/sys/kernel/random/uuid)
experiment=$(cat /proc/sys/kernel/random/uuid)
reservation_a=$(cat /proc/sys/kernel/random/uuid)
reservation_b=$(cat /proc/sys/kernel/random/uuid)
reservation_c=$(cat /proc/sys/kernel/random/uuid)

psql -v ON_ERROR_STOP=1 <<SQL
INSERT INTO lab.organizations(id,name) VALUES('$org','concurrency-proof');
INSERT INTO lab.universities(id,organization_id,name) VALUES('$university','$org','concurrency-proof');
INSERT INTO lab.projects(id,organization_id,university_id,name) VALUES('$project','$org','$university','concurrency-proof');
INSERT INTO lab.experiments(id,organization_id,project_id,privacy_tier,budget_microcredits)
 VALUES('$experiment','$org','$project','PRIVATE',1000);
INSERT INTO lab.credit_accounts(organization_id,funded_microcredits) VALUES('$org',1000);
SQL

# Two independent connections racing the IDENTICAL payload and idempotency key.
# The first holds the locked account row until commit; the second must replay.
psql -v ON_ERROR_STOP=1 > /tmp/lab-ledger-same-a.log 2>&1 <<SQL &
BEGIN;
SELECT set_config('lab.trusted_organization_id','$org',true);
SELECT lab.apply_credit_event('$org','$experiment','$reservation_a','reserve',600,'concurrent-same-reserve-0001') AS receipt;
SELECT pg_sleep(2);
COMMIT;
SQL
pid_a=$!
sleep 0.3
psql -v ON_ERROR_STOP=1 > /tmp/lab-ledger-same-b.log 2>&1 <<SQL &
BEGIN;
SELECT set_config('lab.trusted_organization_id','$org',true);
SELECT lab.apply_credit_event('$org','$experiment','$reservation_a','reserve',600,'concurrent-same-reserve-0001') AS receipt;
COMMIT;
SQL
pid_b=$!
wait "$pid_a"
wait "$pid_b"
grep -q '"replayed": false' /tmp/lab-ledger-same-a.log
grep -q '"replayed": true' /tmp/lab-ledger-same-b.log

# Two distinct reservations against the remaining 400 credits; only the 300 may pass.
psql -v ON_ERROR_STOP=1 > /tmp/lab-ledger-distinct-a.log 2>&1 <<SQL &
BEGIN;
SELECT set_config('lab.trusted_organization_id','$org',true);
SELECT lab.apply_credit_event('$org','$experiment','$reservation_b','reserve',300,'concurrent-different-0001');
SELECT pg_sleep(2);
COMMIT;
SQL
pid_a=$!
sleep 0.3
psql -v ON_ERROR_STOP=1 > /tmp/lab-ledger-distinct-b.log 2>&1 <<SQL &
BEGIN;
SELECT set_config('lab.trusted_organization_id','$org',true);
SELECT lab.apply_credit_event('$org','$experiment','$reservation_c','reserve',800,'concurrent-different-0002');
COMMIT;
SQL
pid_b=$!
wait "$pid_a"
if wait "$pid_b"; then echo "FAIL: competing reservation overspent the account" >&2; exit 1; fi
grep -q 'lab_experiment_budget_exceeded\|lab_insufficient_credits' /tmp/lab-ledger-distinct-b.log

psql -v ON_ERROR_STOP=1 <<SQL
DO \$\$
DECLARE info jsonb;
BEGIN
 IF (SELECT count(*) FROM lab.credit_events WHERE organization_id='$org' AND operation='reserve') <> 2
   THEN RAISE EXCEPTION 'FAIL: duplicate capture or extra reservation event'; END IF;
 IF (SELECT reserved_microcredits FROM lab.credit_accounts WHERE organization_id='$org') <> 900
   THEN RAISE EXCEPTION 'FAIL: reservation balance'; END IF;
 PERFORM set_config('lab.trusted_organization_id','$org',true);
 PERFORM lab.apply_credit_event('$org','$experiment','$reservation_a','capture',200,'concurrent-capture-00001',0.12,'measured-receipt-00001');
 PERFORM lab.apply_credit_event('$org','$experiment','$reservation_a','release',400,'concurrent-release-00001');
 PERFORM lab.apply_credit_event('$org','$experiment','$reservation_b','release',300,'concurrent-release-00002');
 info := lab.reconcile_credit_account('$org');
 IF NOT (info->>'pass')::boolean THEN RAISE EXCEPTION 'FAIL: reconciliation %', info; END IF;
 IF (SELECT reserved_microcredits FROM lab.credit_accounts WHERE organization_id='$org') <> 0
   OR (SELECT captured_microcredits FROM lab.credit_accounts WHERE organization_id='$org') <> 200
   THEN RAISE EXCEPTION 'FAIL: final account balances'; END IF;
 RAISE NOTICE 'PASS: same-key concurrent replay, competing reservation cap, partial capture/release, reconciliation';
END \$\$;
SQL
