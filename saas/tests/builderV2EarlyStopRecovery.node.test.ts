import test from 'node:test'
import assert from 'node:assert/strict'
import { builderV2RecoverableEarlyStop } from '../lib/builder/agent-v2-job-cycle.ts'

test('productive partial builds survive an unverified early finish', () => {
  for (const reason of ['builder_v2_unverified_completion', 'builder_v2_checklist_incomplete', 'builder_v2_invalid_model_action']) {
    assert.equal(builderV2RecoverableEarlyStop(reason, true, true), true, reason)
    assert.equal(builderV2RecoverableEarlyStop(reason, false, true), false, reason)
    assert.equal(builderV2RecoverableEarlyStop(reason, true, false), false, reason)
  }
})
test('fatal reasons and model budget exhaustion never become recoverable', () => {
  for (const reason of ['builder_v2_checkpoint_scope_mismatch','builder_v2_model_call_budget_exhausted','builder_v2_total_deadline_exceeded','builder_v2_claim_stale']) {
    assert.equal(builderV2RecoverableEarlyStop(reason,true,true),false,reason)
  }
})
