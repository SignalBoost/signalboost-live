#!/usr/bin/env bash
# Phase 4: read-only accounting inspection. Never spend funds or fake a callback.
source "$(dirname "$0")/lib/common.sh"
need ORG_A STAGING_DB_URL
[[ -n "${RUN_A:-}" ]] || { echo "RUN_A required; complete approved training first" >&2; exit 2; }
row=$(psql_db -c "select teacher_reserved_usd, committed_max_cost_usd, teacher_spent_usd, stage, teacher_reservation_state, spend_blocked_at is not null from lab.customer_training_runs where id='$RUN_A'" 2>/dev/null || true)
f=$(evidence credit-row <<<"$row")
if [[ -z "$row" || "$row" == *ERROR* ]]; then
  record CREDIT_RESERVATION_ATOMIC failed "Cannot retrieve live accounting row" "$f"
else
  record CREDIT_RESERVATION_ATOMIC unverified "Accounting row exists; prove reserve/capture/release atomicity with concurrent authenticated transactions and ledger receipts" "$f"
fi
overrun=$(psql_db -c "select (teacher_spent_usd > teacher_reserved_usd), (spend_blocked_at is not null or stage='failed') from lab.customer_training_runs where id='$RUN_A'" 2>/dev/null || true)
if [[ "$overrun" == "t|t" ]]; then
  record OVERRUN_RECORDED_AND_BLOCKED unverified "Overrun and block recorded; customer request refusal must still be tested" "$f"
elif [[ "$overrun" == "t|f" ]]; then
  record OVERRUN_RECORDED_AND_BLOCKED failed "Overrun exists but run is not blocked" "$f"
else
  record OVERRUN_RECORDED_AND_BLOCKED unverified "No overrun observed; test with bounded controlled fixture" "$f"
fi
# A hash is not a stage token; a 404 is not proof of replay protection.
# Never call an invented /callback/replayed URL or expose callback secrets.
record DUPLICATE_CALLBACK_NO_DOUBLE_CHARGE unverified "Replay genuine already-used callback at actual endpoint, compare ledger and HF job counts, prove state unchanged"
record SPEND_LIMIT_AFTER_BLOCK unverified "Use authenticated customer session and complete reserve_teacher RPC signature to prove blocked-run spending refusal"
record PLATFORM_FAULT_REFUND unverified "Force controlled platform-side staging failure and verify unused reserve release and refund receipt"
record COST_RECONCILIATION unverified "Reconcile recorded teacher/computation cost with actual provider usage receipts"
