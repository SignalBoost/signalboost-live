// saas/tests/cosUniversityRecoveryDrillRoute.node.test.ts
// The drill route injects a fault into live tables, so its contract matters as much as its logic. These
// assertions pin the properties that keep a drill from becoming an incident of its own.
import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

const route = readFileSync(
  new URL('../app/api/admin/cos-university-recovery-drill/route.ts', import.meta.url),
  'utf8',
)
const code = route.split('\n')
  .filter(line => !line.trim().startsWith('//') && !line.trim().startsWith('*') && !line.trim().startsWith('/*'))
  .join('\n')

test('the route is owner-only on both verbs and never cached', () => {
  assert.equal((code.match(/await requireOwner\(\)/g) || []).length, 2)
  assert.equal((code.match(/authRequired: true/g) || []).length, 2)
  assert.match(code, /'Cache-Control': 'no-store, max-age=0'/)
})

test('arming refuses anything but the one permitted drill kind', () => {
  assert.match(code, /drill_kind_not_permitted/)
  assert.match(code, /text\(body\?\.kind\) !== 'self_healing_recovery'/)
})

test('a drill is bounded before anything is written', () => {
  const armIndex = code.indexOf('assertRecoveryDrillBounded(drill)')
  const insertIndex = code.indexOf('.insert({')
  assert.ok(armIndex > 0 && insertIndex > armIndex, 'bounds must be asserted before the fixture insert')
  assert.match(code, /const DRILL_TTL_SECONDS = 900/)
})

test('only one drill may be armed at a time', () => {
  assert.match(code, /recovery_drill_already_armed/)
  assert.match(code, /no_active_campaign_to_drill/)
})

test('the fixture is marked as a drill row so the database guards apply', () => {
  assert.match(code, /drill_id: drillId/)
  assert.match(code, /stage: 'teacher_dispatching'/)
})

test('the route never repairs the fault it injected', () => {
  // Any stage mutation here would prove the drill works rather than that Self-Healing works. The route
  // may CLASSIFY an observed repair (that is how the verdict is formed); it may never perform one.
  assert.doesNotMatch(code, /from\(RUNS\)[\s\S]{0,80}\.update\(/)
  assert.doesNotMatch(code, /record\(db, [^)]*'recovery_drill_repair/)
  assert.match(code, /kind: text\(row\.evidence\?\.claim\)\.includes\('repair'\) \? 'repair_applied'/)
})

test('rollback deletes only this drill fixture, and only its own', () => {
  assert.match(code, /\.delete\(\)\.eq\('id', existing\.drill\.injectedRunId\)\.eq\('drill_id', existing\.drill\.drillId\)/)
  assert.match(code, /plan\.step === 'rollback_fault'/)
  assert.match(code, /drill_rollback_failed/)
})

test('drill evidence stays off the learning paths', () => {
  // An undeclared path id reads as staging drift; a declared one becomes required by aggregate
  // verification and would block graduation whenever no drill is running.
  assert.doesNotMatch(code, /recordCosUniversityProductionPath/)
  assert.doesNotMatch(code, /path_id/)
  assert.match(code, /event_type: 'fine_tune'/)
  assert.match(code, /candidate_id: candidateId/)
})

test('the actor is derived from the recorded verifier, never from the request', () => {
  assert.match(code, /row\.verifier === 'self_healing_supervisor' \? 'supervisor'/)
  assert.doesNotMatch(code, /body\?\.actor|body\.actor/)
})

test('the route grants no spend or promotion authority', () => {
  for (const forbidden of ['committed_cost_usd', 'max_total_cost_usd', 'canaryAuthorized', 'evaluationAuthorized', 'productionTrafficAuthorized: true']) {
    assert.ok(!code.includes(forbidden), `drill route must not reference ${forbidden}`)
  }
  assert.match(code, /authorityExpanded: false/)
})
