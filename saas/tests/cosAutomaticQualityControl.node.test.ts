import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

const file = (relative: string) => readFileSync(new URL(relative, import.meta.url), 'utf8')

test('quality control runs unattended on a Vercel cron', () => {
  const vercel = JSON.parse(file('../vercel.json'))
  const cron = vercel.crons.find((item: any) => item.path === '/api/cron/cos-quality-control')
  assert.deepEqual(cron, { path: '/api/cron/cos-quality-control', schedule: '20 8 * * *' })
})

test('automatic quality route samples existing benchmark cohorts and routes incidents into Self-Healing', () => {
  const source = file('../app/api/cron/cos-quality-control/route.ts')
  assert.match(source, /runAutomaticPrivateCapabilitySample/)
  assert.match(source, /runAutomaticEvidenceUtilizationSample/)
  assert.match(source, /qualityIncidentForSample/)
  assert.match(source, /qualityBacklogIncident/)
  assert.match(source, /remediateNativeIncidents/)
  assert.match(source, /maxIncidents: 1/)
  assert.match(source, /automatic: true/)
})

test('automatic samples write to the existing benchmark tables instead of a parallel dashboard store', () => {
  const source = file('../lib/ai/cos/automaticQualityControl.ts')
  assert.match(source, /cos_capability_benchmark_runs/)
  assert.match(source, /cos_capability_benchmark_results/)
  assert.match(source, /cos_evidence_utilization_benchmark_runs/)
  assert.match(source, /cos_evidence_utilization_benchmark_results/)
  assert.match(source, /runPrivateCapabilityCase/)
  assert.doesNotMatch(source, /create table/i)
})

test('only a scored regression or backlog receives the exact pre-authorized recovery target', () => {
  const source = file('../lib/ai/cos/automaticQualityControl.ts')
  assert.match(source, /const preauthorized = regression/)
  assert.match(source, /registeredRecoveryAction: COS_QUALITY_RECOVERY_TARGET/)
  assert.match(source, /recoveryPreauthorized: true/)
  assert.match(source, /COS_QUALITY_RUNTIME_ERROR_CODE/)
  assert.match(source, /\.\.\.\(preauthorized \? \{ registeredRecoveryAction:/)
})

test('quality recovery is a registered reversible Agent Gateway action, not model-authored mutation authority', () => {
  const policy = file('../self-healing-host/self-healing-gateway-policy.ts')
  const resolver = file('../self-healing-host/native-repair-action-resolver.ts')
  const host = file('../agent-gateway-host/signalboost-host.ts')
  const action = file('../agent-gateway-host/cos-quality-recovery.ts')

  assert.match(policy, /signalboost\.self_healing\.reversible\.cos_quality_recovery/)
  assert.match(policy, /consequenceClass: 'reversible_internal'/)
  assert.match(policy, /COS_QUALITY_RECOVERY_ALLOWLIST_ENTRY/)

  assert.match(resolver, /registeredRecoveryAction === COS_QUALITY_RECOVERY_TARGET/)
  assert.match(resolver, /recoveryPreauthorized === true/)
  assert.match(resolver, /step\.executor === 'api_executor'/)

  assert.match(host, /createCosQualityRecoveryExecutor\(\)/)
  assert.match(action, /runNextFailureAutopsyRetest/)
  assert.match(action, /reconcileFailureAutopsySkills/)
  assert.match(action, /does not edit application code, provider configuration, credentials, billing/)
})

test('quality repair graduates only through the existing validated cognitive-skill lifecycle and can roll back by weakening', () => {
  const promotion = file('../lib/ai/cos/failureAutopsyPromotion.ts')
  const context = file('../lib/ai/cos/cognitiveSkillContext.ts')
  assert.match(promotion, /status: 'validated'/)
  assert.match(promotion, /weakened_at: now/)
  assert.match(promotion, /original_prompt_stored: false/)
  assert.match(context, /\.in\('status', \['validated', 'learned', 'mastered'\]\)/)
})
