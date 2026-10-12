#!/usr/bin/env bash
# Phase 1: customer flow and unattended University evidence audit. No paid calls.
source "$(dirname "$0")/lib/common.sh"
need ORG_A ORG_B STAGING_DB_URL
bws=$(psql_db -c "select count(*) from lab.organization_members where organization_id='$ORG_B' and status='active'" 2>/dev/null || echo 0)
bkeys=$(psql_db -c "select count(*) from lab.provider_credentials where organization_id='$ORG_B' and revoked_at is null" 2>/dev/null || echo 0)
f=$(evidence customer-b <<<"active_members=$bws active_credentials=$bkeys")
record TWO_CUSTOMER_ACCEPTANCE unverified "Customer B has $bws active members and $bkeys active credentials; both customers must separately complete authorized train/retrieve and isolation checks" "$f"
# Do not query a speculative endpoint and interpret HTTP 200 as unattended factory execution.
record FACTORY_RUNS_SURFACE unverified "Verify actual University orchestrator jobs, schedule, receipts and exact deployed revision"
record FACTORY_RECOVERY unverified "Interrupt a disposable worker mid-run and verify deterministic recovery, budget release and no duplicate job"
record ORCHESTRATOR_EVALUATOR_RESIDENCY unverified "Demonstrate live orchestrator -> evaluator -> Builder Residency evidence for exact artifact"
record RETRAINING unverified "After authorized first run completes, run a bounded retrain and independently verify downloaded descendant artifact"
