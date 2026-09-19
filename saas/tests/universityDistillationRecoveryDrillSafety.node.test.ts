// saas/tests/universityDistillationRecoveryDrillSafety.node.test.ts
// The drill uses the live mass-distillation table, so autonomous repair must be exact: only a
// currently armed fixture may be removed, and clearing it must never enter a paid dispatch path.
import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

const source = readFileSync(
  new URL('../agent-gateway-host/university-distillation-recovery.ts', import.meta.url),
  'utf8',
)

test('Supervisor drill repair is bound to an armed exact fixture', () => {
  assert.match(source, /RECOVERY_DRILL_PROFILE/)
  assert.match(source, /\.eq\('candidate_id', `drill:\$\{drillId\}`\)/)
  assert.match(source, /\.eq\('verifier', 'host_controller'\)/)
  assert.match(source, /claim: 'recovery_drill_armed'/)
  assert.match(source, /drill\?\.injectedRunId === runId/)
  assert.match(source, /drill\?\.faultKind === 'dispatch_claim_stalled'/)
  assert.match(source, /event\.evidence\?\.campaignId === campaignId/)
  assert.match(source, /Date\.parse\(String\(drill\.expiresAt\)\) > input\.now\.getTime\(\)/)
})

test('Supervisor can clear only the exact drill row and never mutate its stage', () => {
  assert.match(source, /\.delete\(\)[\s\S]*?\.eq\('id', runId\)[\s\S]*?\.eq\('campaign_id', campaignId\)[\s\S]*?\.eq\('drill_id', drillId\)/)
  assert.match(source, /university_recovery_drill_clear_not_exact/)
  const helper = source.slice(source.indexOf('async function repairVerifiedRecoveryDrillFixture'), source.indexOf('/**\n * Executes the same bounded workflow'))
  assert.doesNotMatch(helper, /\.update\(/)
  assert.doesNotMatch(helper, /committed_cost_usd|max_total_cost_usd|stage_reserved_cost_usd/)
})

test('drill repair records autonomous supervisor evidence with every authority fence closed', () => {
  assert.match(source, /claim: 'recovery_drill_repair_applied'/)
  assert.match(source, /verifier: 'self_healing_supervisor'/)
  assert.match(source, /dispatchAuthorized: false/)
  assert.match(source, /spendAuthorized: false/)
  assert.match(source, /productionTrafficAuthorized: false/)
  assert.match(source, /automaticPromotionAuthorized: false/)
  assert.match(source, /runpodMutationAuthorized: false/)
  assert.match(source, /authorityExpanded: false/)
})

test('zero-spend drill repair runs before HF preflight and independently re-verifies health', () => {
  const recover = source.slice(source.indexOf('export async function recoverUniversityMassDistillation'))
  const drill = recover.indexOf('repairVerifiedRecoveryDrillFixture')
  const reread = recover.indexOf('const afterDrill = await readHealth')
  const preflight = recover.indexOf('const workerPreflight = await preflightWorker()')
  assert.ok(drill > 0 && reread > drill && preflight > reread)
  assert.match(recover, /afterDrill\.state !== 'repair_required'/)
  assert.match(recover, /paidDispatchSuppressed: true/)
  assert.match(recover, /recoveryDrillRepaired: true/)
})

test('a separate real fault still falls through to the ordinary governed recovery', () => {
  assert.match(source, /if \(afterDrill\.state !== 'repair_required'\)/)
  assert.match(source, /const workerPreflight = await preflightWorker\(\)/)
  assert.match(source, /runCosUniversityMassDistillationWorkflow/)
  assert.match(source, /workerPreflightPassed: true/)
})
