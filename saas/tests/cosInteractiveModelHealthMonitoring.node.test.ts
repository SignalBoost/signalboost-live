// saas/tests/cosInteractiveModelHealthMonitoring.node.test.ts
// Chat/model health monitor (2026-09-27): pure evaluation, exclusions, sample recording and cron wiring.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  COS_LATENCY_STAGE_TASK,
  INTERACTIVE_MODEL_HEALTH_PROBE_ID,
  INTERACTIVE_MODEL_HEALTH_TARGET,
  evaluateInteractiveModelHealth,
  excludedFromInteractiveHealth,
  interactiveModelHealthMonitoringCollector,
  interactiveModelHealthThresholds,
  type ModelCallRow,
  type StageRow,
} from '../self-healing-host/interactive-model-health-monitoring.ts'

const now = new Date('2026-09-27T18:00:00.000Z')
const thresholds = interactiveModelHealthThresholds()

function calls(count: number, row: Partial<ModelCallRow>): ModelCallRow[] {
  return Array.from({ length: count }, () => ({
    feature: 'cos_interactive_answer',
    purpose: 'main_answer',
    model: 'deepseek-ai/DeepSeek-V4-Flash',
    success: true,
    http_status: 200,
    finish_reason: 'stop',
    latency_ms: 3000,
    ...row,
  }))
}

function stages(stage: string, values: number[]): StageRow[] {
  return values.map(latency_ms => ({ source: stage, latency_ms }))
}

test('healthy traffic produces a healthy snapshot with no findings', () => {
  const snapshot = evaluateInteractiveModelHealth({
    now,
    thresholds,
    calls: calls(20, {}),
    stages: [...stages('primary:cos_first_answer', [3000, 3500, 4000, 4200]), ...stages('assistant:total', [4000, 4500, 5000])],
  })
  assert.equal(snapshot.state, 'healthy')
  assert.deepEqual(snapshot.findings, [])
  assert.equal(snapshot.checkedAt, now.toISOString())
  assert.equal(snapshot.modelStats[0].calls, 20)
  assert.equal(snapshot.modelStats[0].failureRate, 0)
})

test('a model that times out on every call is critical (the GLM week-long failure)', () => {
  const snapshot = evaluateInteractiveModelHealth({
    now,
    thresholds,
    calls: [...calls(8, { model: 'zai-org/GLM-5.3-Flash', success: false, http_status: null, finish_reason: null, latency_ms: 20000 }), ...calls(10, {})],
    stages: [],
  })
  assert.equal(snapshot.state, 'critical')
  const finding = snapshot.findings.find(f => f.kind === 'model_failure_rate')
  assert.ok(finding)
  assert.equal(finding.severity, 'critical')
  assert.match(finding.key, /GLM-5\.3-Flash/)
  assert.match(finding.summary, /8 timeouts/)
})

test('a moderate failure rate is a warning, and too few calls raise nothing', () => {
  const warning = evaluateInteractiveModelHealth({
    now,
    thresholds,
    calls: [...calls(4, { success: false, http_status: 502 }), ...calls(6, {})],
    stages: [],
  })
  assert.equal(warning.state, 'warning')
  assert.equal(warning.findings[0].kind, 'model_failure_rate')
  assert.equal(warning.modelStats[0].httpErrors, 4)

  const sparse = evaluateInteractiveModelHealth({ now, thresholds, calls: calls(2, { success: false, http_status: null }), stages: [] })
  assert.equal(sparse.state, 'healthy')
})

test('successful calls that keep hitting the output limit raise a length-cut warning', () => {
  const snapshot = evaluateInteractiveModelHealth({
    now,
    thresholds,
    calls: [...calls(3, { finish_reason: 'length' }), ...calls(7, {})],
    stages: [],
  })
  assert.equal(snapshot.state, 'warning')
  assert.equal(snapshot.findings[0].kind, 'model_length_cut_rate')
  assert.equal(snapshot.modelStats[0].lengthCuts, 3)
})

test('University, distillation and independent evaluation traffic is excluded', () => {
  assert.equal(excludedFromInteractiveHealth({ feature: 'cos_university_exam', purpose: null }), true)
  assert.equal(excludedFromInteractiveHealth({ feature: 'university_lane', purpose: null }), true)
  assert.equal(excludedFromInteractiveHealth({ feature: 'mass_distilled_canary', purpose: null }), true)
  assert.equal(excludedFromInteractiveHealth({ feature: 'cos_reasoner', purpose: 'independent_assessment:holdout' }), true)
  assert.equal(excludedFromInteractiveHealth({ feature: 'cos_interactive_answer', purpose: 'main_answer' }), false)

  const snapshot = evaluateInteractiveModelHealth({
    now,
    thresholds,
    calls: calls(20, { feature: 'cos_university_exam', success: false, http_status: null }),
    stages: [],
  })
  assert.equal(snapshot.state, 'healthy')
  assert.equal(snapshot.modelStats.length, 0)
})

test('unlabeled calls are counted so they cannot hide', () => {
  const snapshot = evaluateInteractiveModelHealth({ now, thresholds, calls: calls(3, { feature: null }), stages: [] })
  assert.equal(snapshot.unlabeledCalls, 3)
  assert.equal(snapshot.modelStats[0].feature, 'unattributed_local_inference')
})

test('slow chat stages raise warning, and more than twice the limit is critical', () => {
  const warning = evaluateInteractiveModelHealth({
    now,
    thresholds,
    calls: [],
    stages: stages('concierge:total', [9000, 12000, 16000, 17000]),
  })
  assert.equal(warning.state, 'warning')
  assert.equal(warning.findings[0].kind, 'chat_stage_latency')
  assert.equal(warning.findings[0].key, 'concierge:total')

  const critical = evaluateInteractiveModelHealth({
    now,
    thresholds,
    calls: [],
    stages: stages('primary:cos_first_answer', [30000, 31000, 32000]),
  })
  assert.equal(critical.state, 'critical')
  assert.equal(critical.findings[0].severity, 'critical')

  const unwatched = evaluateInteractiveModelHealth({ now, thresholds, calls: [], stages: stages('primary:web_search', [60000, 60000, 60000]) })
  assert.equal(unwatched.state, 'healthy')
  assert.equal(unwatched.stageStats[0].p90Ms, 60000)
})

test('post-COS rescue firing and exceeded context budgets are surfaced', () => {
  const snapshot = evaluateInteractiveModelHealth({
    now,
    thresholds,
    calls: [],
    stages: [
      ...stages('primary:completion_rescue', [5000, 5000]),
      ...stages('primary:legacy_concierge', [6000]),
      ...stages('retrieval:kg_lexical:budget_exceeded', [2500, 2500]),
    ],
  })
  assert.equal(snapshot.state, 'warning')
  assert.equal(snapshot.findings[0].kind, 'post_cos_rescue_firing')
  assert.equal(snapshot.budgetExceededFallbacks, 2)
})

function fakeDb(input: { calls: ModelCallRow[]; stages: StageRow[] }) {
  const inserts: Array<{ table: string; row: any }> = []
  const filters: Array<{ table: string; op: string; column: string; value: unknown }> = []
  const db = {
    from(table: string) {
      const query: any = {
        select() { return query },
        gte(column: string, value: unknown) { filters.push({ table, op: 'gte', column, value }); return query },
        eq(column: string, value: unknown) { filters.push({ table, op: 'eq', column, value }); return query },
        limit() {
          return Promise.resolve({ data: table === 'provider_inference_usage' ? input.calls : input.stages, error: null })
        },
        insert(row: any) { inserts.push({ table, row }); return Promise.resolve({ error: null }) },
      }
      return query
    },
  }
  return { db, inserts, filters }
}

test('the collector records one observation-only probe sample and returns no incidents', async () => {
  const { db, inserts, filters } = fakeDb({
    calls: calls(6, { model: 'zai-org/GLM-5.3-Flash', success: false, http_status: null }),
    stages: stages('primary:cos_first_answer', [4000, 4500, 5000]),
  })
  const collector = interactiveModelHealthMonitoringCollector({ db, now: () => now })
  assert.equal(collector.id, 'cos-interactive-model-health')
  const incidents = await collector.observer.observe({ provider: 'signalboost-platform', environment: 'production' } as any)
  assert.deepEqual(incidents, [])

  assert.equal(inserts.length, 1)
  const sample = inserts[0]
  assert.equal(sample.table, 'self_healing_native_probe_samples')
  assert.equal(sample.row.probe_id, INTERACTIVE_MODEL_HEALTH_PROBE_ID)
  assert.ok(['api', 'database', 'storage', 'certificate'].includes(sample.row.probe_id))
  assert.equal(sample.row.target, INTERACTIVE_MODEL_HEALTH_TARGET)
  assert.equal(sample.row.status, 'critical')
  assert.equal(sample.row.error_rate, 1)
  assert.equal(sample.row.metric_value, 5000)
  assert.equal(sample.row.details.observationOnly, true)
  assert.equal(sample.row.details.authorityExpanded, false)
  assert.equal(sample.row.details.findings.length, 1)

  assert.ok(filters.some(f => f.table === 'cos_ai_roi_metrics' && f.op === 'eq' && f.column === 'task_id' && f.value === COS_LATENCY_STAGE_TASK))
  const since = filters.find(f => f.table === 'provider_inference_usage' && f.op === 'gte')
  assert.equal(since?.value, new Date(now.getTime() - thresholds.windowMinutes * 60_000).toISOString())
})

test('the probe sample never carries secret-shaped keys', async () => {
  const { db, inserts } = fakeDb({ calls: calls(6, {}), stages: [] })
  await interactiveModelHealthMonitoringCollector({ db, now: () => now }).observer.observe({} as any)
  const serialized = JSON.stringify(inserts[0].row)
  assert.doesNotMatch(serialized, /(password|apiKey|api_key|token"|secret|privateKey|accessToken)/i)
})

test('the native monitoring cron runs the collector', () => {
  const source = readFileSync(new URL('../app/api/cron/native-proactive-monitoring/route.ts', import.meta.url), 'utf8')
  assert.match(source, /import \{ interactiveModelHealthMonitoringCollector \} from '@\/self-healing-host\/interactive-model-health-monitoring'/)
  assert.match(source, /interactiveModelHealthMonitoringCollector\(\{ db \}\)/)
})
