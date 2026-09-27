// saas/self-healing-host/interactive-model-health-monitoring.ts
// INTERACTIVE MODEL & CHAT HEALTH MONITOR (2026-09-27, owner-directed observability).
//
// Why this exists: on 2026-09-27 the main COS chat answer step had succeeded on only 9% of calls for a week
// (38 timeouts at its 20s limit), GLM-5.3-Flash never answered inside its limit, two hidden 18s detours sat in
// front of COS, and the Concierge travel planner always ran out of time. Every one of those facts was already
// in `provider_inference_usage` / `cos_ai_roi_metrics`, but nothing read them, so the owner found them by hand.
//
// This collector reads those two tables every Self-Healing cycle (native-proactive-monitoring cron, every 5 min)
// and records one probe sample per run in `self_healing_native_probe_samples`
// (probe_id 'api', target 'cos:interactive-model-health'). A `warning` / `critical` sample is picked up by the
// owner executive briefing (lib/ai/cos/ownerExecutiveBriefing.ts), so degradations reach the owner without a query.
//
// Observation only: it returns no SupervisorIncident, so it never triggers autonomous repair. Promoting these
// findings into governed remediation is a separate, reviewed step.
import type { Observer, ProviderObservationContext } from '../lib/supervisor/execution-contracts.ts'
import type { SupervisorIncident } from '../lib/supervisor/incident-schema.ts'
import type { NativeMonitoringCollector } from './native-monitoring-runtime.ts'

export const INTERACTIVE_MODEL_HEALTH_TARGET = 'cos:interactive-model-health'
export const INTERACTIVE_MODEL_HEALTH_PROBE_ID = 'api'
export const COS_LATENCY_STAGE_TASK = 'cos-latency-stage'

export type ModelCallRow = Readonly<{
  feature: string | null
  purpose?: string | null
  model: string | null
  success: boolean | null
  http_status?: number | null
  finish_reason?: string | null
  latency_ms: number | null
}>

export type StageRow = Readonly<{ source: string | null; latency_ms: number | null }>

export type HealthThresholds = Readonly<{
  windowMinutes: number
  minModelCalls: number
  failureWarning: number
  failureCritical: number
  lengthCutWarning: number
  minStageSamples: number
  totalP90WarningMs: number
  beforeCosP90WarningMs: number
  cosAnswerP90WarningMs: number
  rescueWarningCount: number
}>

export type HealthFinding = Readonly<{
  kind: 'model_failure_rate' | 'model_length_cut_rate' | 'chat_stage_latency' | 'post_cos_rescue_firing'
  key: string
  severity: 'warning' | 'critical'
  summary: string
}>

export type ModelStat = Readonly<{
  feature: string
  model: string
  calls: number
  failures: number
  timeouts: number
  httpErrors: number
  lengthCuts: number
  failureRate: number
  lengthCutRate: number
  p90Ms: number | null
}>

export type StageStat = Readonly<{ stage: string; samples: number; p50Ms: number | null; p90Ms: number | null }>

export type InteractiveModelHealthSnapshot = Readonly<{
  checkedAt: string
  state: 'healthy' | 'warning' | 'critical'
  windowMinutes: number
  findings: readonly HealthFinding[]
  modelStats: readonly ModelStat[]
  stageStats: readonly StageStat[]
  unlabeledCalls: number
  budgetExceededFallbacks: number
}>

function envNumber(name: string, fallback: number, min: number, max: number): number {
  const value = Number(process.env[name] ?? fallback)
  return Number.isFinite(value) ? Math.min(Math.max(value, min), max) : fallback
}

export function interactiveModelHealthThresholds(): HealthThresholds {
  return Object.freeze({
    windowMinutes: envNumber('COS_HEALTH_WINDOW_MINUTES', 60, 10, 24 * 60),
    minModelCalls: envNumber('COS_HEALTH_MIN_MODEL_CALLS', 5, 1, 1000),
    failureWarning: envNumber('COS_HEALTH_FAILURE_WARNING', 0.3, 0.01, 1),
    failureCritical: envNumber('COS_HEALTH_FAILURE_CRITICAL', 0.6, 0.01, 1),
    lengthCutWarning: envNumber('COS_HEALTH_LENGTH_CUT_WARNING', 0.2, 0.01, 1),
    minStageSamples: envNumber('COS_HEALTH_MIN_STAGE_SAMPLES', 3, 1, 1000),
    totalP90WarningMs: envNumber('COS_HEALTH_TOTAL_P90_WARNING_MS', 15_000, 1_000, 600_000),
    beforeCosP90WarningMs: envNumber('COS_HEALTH_BEFORE_COS_P90_WARNING_MS', 8_000, 500, 600_000),
    cosAnswerP90WarningMs: envNumber('COS_HEALTH_COS_ANSWER_P90_WARNING_MS', 12_000, 1_000, 600_000),
    rescueWarningCount: envNumber('COS_HEALTH_RESCUE_WARNING_COUNT', 3, 1, 1000),
  })
}

/** University exams, distillation and independent evaluations have their own monitors and deliberately long prompts. */
export function excludedFromInteractiveHealth(row: Pick<ModelCallRow, 'feature' | 'purpose'>): boolean {
  const feature = String(row.feature || '').toLowerCase()
  const purpose = String(row.purpose || '').toLowerCase()
  return feature.startsWith('cos_university')
    || feature.startsWith('university_')
    || feature.startsWith('mass_distilled')
    || purpose.includes('independent_assessment')
    || purpose.includes('independent_evaluation')
}

function percentile(values: readonly number[], fraction: number): number | null {
  const sorted = values.filter(value => Number.isFinite(value)).slice().sort((a, b) => a - b)
  if (!sorted.length) return null
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(fraction * sorted.length) - 1))
  return Math.round(sorted[index])
}

const LATENCY_STAGE_LIMITS: ReadonlyArray<{ match: (stage: string) => boolean; limit: (t: HealthThresholds) => number }> = [
  { match: stage => /^(assistant|concierge):total$/.test(stage), limit: t => t.totalP90WarningMs },
  { match: stage => stage === 'primary:before_cos_first', limit: t => t.beforeCosP90WarningMs },
  { match: stage => stage === 'primary:cos_first_answer', limit: t => t.cosAnswerP90WarningMs },
]

/** Pure evaluation: rows in, snapshot out. No I/O, so it is fully testable. */
export function evaluateInteractiveModelHealth(input: {
  calls: readonly ModelCallRow[]
  stages: readonly StageRow[]
  now?: Date
  thresholds?: HealthThresholds
}): InteractiveModelHealthSnapshot {
  const t = input.thresholds ?? interactiveModelHealthThresholds()
  const checkedAt = (input.now ?? new Date()).toISOString()
  const findings: HealthFinding[] = []

  const groups = new Map<string, { feature: string; model: string; rows: ModelCallRow[] }>()
  let unlabeledCalls = 0
  for (const row of input.calls) {
    if (excludedFromInteractiveHealth(row)) continue
    const feature = String(row.feature || 'unattributed_local_inference')
    const model = String(row.model || 'unknown')
    if (feature === 'unattributed_local_inference') unlabeledCalls += 1
    const key = `${feature}|${model}`
    const group = groups.get(key) ?? { feature, model, rows: [] }
    group.rows.push(row)
    groups.set(key, group)
  }

  const modelStats: ModelStat[] = [...groups.values()].map(group => {
    const calls = group.rows.length
    const failures = group.rows.filter(row => row.success !== true).length
    const timeouts = group.rows.filter(row => row.success !== true && (row.http_status === null || row.http_status === undefined)).length
    const httpErrors = group.rows.filter(row => row.success !== true && typeof row.http_status === 'number' && (row.http_status < 200 || row.http_status >= 300)).length
    const lengthCuts = group.rows.filter(row => String(row.finish_reason || '') === 'length').length
    return {
      feature: group.feature,
      model: group.model,
      calls,
      failures,
      timeouts,
      httpErrors,
      lengthCuts,
      failureRate: calls ? failures / calls : 0,
      lengthCutRate: calls ? lengthCuts / calls : 0,
      p90Ms: percentile(group.rows.map(row => Number(row.latency_ms)), 0.9),
    }
  }).sort((a, b) => b.calls - a.calls)

  for (const stat of modelStats) {
    if (stat.calls < t.minModelCalls) continue
    const key = `${stat.feature} / ${stat.model}`
    if (stat.failureRate >= t.failureWarning) {
      findings.push({
        kind: 'model_failure_rate',
        key,
        severity: stat.failureRate >= t.failureCritical ? 'critical' : 'warning',
        summary: `${key}: ${Math.round(stat.failureRate * 100)}% of ${stat.calls} calls failed in the last ${t.windowMinutes} min (${stat.timeouts} timeouts, ${stat.httpErrors} HTTP errors, ${stat.lengthCuts} length cuts; p90 ${stat.p90Ms ?? '?'} ms).`,
      })
    } else if (stat.lengthCutRate >= t.lengthCutWarning) {
      findings.push({
        kind: 'model_length_cut_rate',
        key,
        severity: 'warning',
        summary: `${key}: ${Math.round(stat.lengthCutRate * 100)}% of ${stat.calls} calls hit the output limit (finish=length) in the last ${t.windowMinutes} min.`,
      })
    }
  }

  const stageGroups = new Map<string, number[]>()
  for (const row of input.stages) {
    const stage = String(row.source || '')
    if (!stage) continue
    const list = stageGroups.get(stage) ?? []
    list.push(Number(row.latency_ms))
    stageGroups.set(stage, list)
  }
  const stageStats: StageStat[] = [...stageGroups.entries()]
    .map(([stage, values]) => ({ stage, samples: values.length, p50Ms: percentile(values, 0.5), p90Ms: percentile(values, 0.9) }))
    .sort((a, b) => a.stage.localeCompare(b.stage))

  for (const stat of stageStats) {
    const rule = LATENCY_STAGE_LIMITS.find(candidate => candidate.match(stat.stage))
    if (!rule || stat.samples < t.minStageSamples || stat.p90Ms === null) continue
    const limit = rule.limit(t)
    if (stat.p90Ms > limit) {
      findings.push({
        kind: 'chat_stage_latency',
        key: stat.stage,
        severity: stat.p90Ms > limit * 2 ? 'critical' : 'warning',
        summary: `${stat.stage}: p90 ${stat.p90Ms} ms over ${stat.samples} turns in the last ${t.windowMinutes} min (limit ${limit} ms).`,
      })
    }
  }

  const rescueCount = stageStats
    .filter(stat => stat.stage === 'primary:completion_rescue' || stat.stage === 'primary:legacy_concierge')
    .reduce((sum, stat) => sum + stat.samples, 0)
  if (rescueCount >= t.rescueWarningCount) {
    findings.push({
      kind: 'post_cos_rescue_firing',
      key: 'primary:post_cos_rescue',
      severity: 'warning',
      summary: `Post-COS rescue/legacy paths ran ${rescueCount} times in the last ${t.windowMinutes} min; COS itself is not answering those turns.`,
    })
  }

  const budgetExceededFallbacks = stageStats
    .filter(stat => stat.stage.endsWith(':budget_exceeded'))
    .reduce((sum, stat) => sum + stat.samples, 0)

  const state = findings.some(f => f.severity === 'critical') ? 'critical' : findings.length ? 'warning' : 'healthy'
  return Object.freeze({
    checkedAt,
    state,
    windowMinutes: t.windowMinutes,
    findings: Object.freeze(findings),
    modelStats: Object.freeze(modelStats),
    stageStats: Object.freeze(stageStats),
    unlabeledCalls,
    budgetExceededFallbacks,
  })
}

export async function readInteractiveModelHealth(input: { db: any; now?: Date; thresholds?: HealthThresholds }): Promise<InteractiveModelHealthSnapshot> {
  const thresholds = input.thresholds ?? interactiveModelHealthThresholds()
  const now = input.now ?? new Date()
  const since = new Date(now.getTime() - thresholds.windowMinutes * 60_000).toISOString()
  const [calls, stages] = await Promise.all([
    input.db.from('provider_inference_usage')
      .select('feature,purpose,model,success,http_status,finish_reason,latency_ms')
      .gte('created_at', since)
      .limit(5000),
    input.db.from('cos_ai_roi_metrics')
      .select('source,latency_ms')
      .eq('task_id', COS_LATENCY_STAGE_TASK)
      .gte('created_at', since)
      .limit(5000),
  ])
  if (calls.error) throw new Error(`interactive_model_health_usage_read_failed:${String(calls.error.message || 'unknown').slice(0, 160)}`)
  if (stages.error) throw new Error(`interactive_model_health_stage_read_failed:${String(stages.error.message || 'unknown').slice(0, 160)}`)
  return evaluateInteractiveModelHealth({ calls: calls.data ?? [], stages: stages.data ?? [], now, thresholds })
}

async function recordHealthSample(db: any, snapshot: InteractiveModelHealthSnapshot, latencyMs: number): Promise<void> {
  const worstFailureRate = snapshot.modelStats.reduce((max, stat) => Math.max(max, stat.failureRate), 0)
  const chatP90 = snapshot.stageStats.find(stat => stat.stage === 'primary:cos_first_answer')?.p90Ms ?? null
  const { error } = await db.from('self_healing_native_probe_samples').insert({
    probe_id: INTERACTIVE_MODEL_HEALTH_PROBE_ID,
    target: INTERACTIVE_MODEL_HEALTH_TARGET,
    observed_at: snapshot.checkedAt,
    status: snapshot.state,
    latency_ms: latencyMs,
    error_rate: Number(worstFailureRate.toFixed(4)),
    metric_value: chatP90,
    metric_unit: 'cos_answer_p90_ms',
    details: {
      probeKind: 'cos_interactive_model_health',
      windowMinutes: snapshot.windowMinutes,
      findings: snapshot.findings.map(f => ({ kind: f.kind, key: f.key, severity: f.severity, summary: f.summary })),
      modelStats: snapshot.modelStats.slice(0, 12).map(s => ({
        feature: s.feature, model: s.model, calls: s.calls, failures: s.failures, timeouts: s.timeouts,
        httpErrors: s.httpErrors, lengthCuts: s.lengthCuts, p90Ms: s.p90Ms,
      })),
      stageStats: snapshot.stageStats.slice(0, 30).map(s => ({ stage: s.stage, samples: s.samples, p50Ms: s.p50Ms, p90Ms: s.p90Ms })),
      unlabeledCalls: snapshot.unlabeledCalls,
      budgetExceededFallbacks: snapshot.budgetExceededFallbacks,
      observationOnly: true,
      authorityExpanded: false,
    },
  })
  if (error) throw new Error(`interactive_model_health_sample_save_failed:${String(error.message || 'unknown').slice(0, 180)}`)
}

export class InteractiveModelHealthObserver implements Observer {
  private readonly input: { db: any; now?: () => Date }

  constructor(input: { db: any; now?: () => Date }) {
    this.input = input
  }

  async observe(_context: ProviderObservationContext): Promise<SupervisorIncident[]> {
    const started = performance.now()
    const snapshot = await readInteractiveModelHealth({ db: this.input.db, now: this.input.now?.() })
    await recordHealthSample(this.input.db, snapshot, Math.round(performance.now() - started))
    if (snapshot.state !== 'healthy') {
      console.warn('[cos-interactive-model-health]', JSON.stringify({ state: snapshot.state, findings: snapshot.findings.map(f => f.summary) }))
    }
    // Observation only: the probe sample is the durable signal (owner briefing reads warning/critical samples).
    return []
  }
}

export function interactiveModelHealthMonitoringCollector(input: { db: any; now?: () => Date }): NativeMonitoringCollector {
  return {
    id: 'cos-interactive-model-health',
    signals: ['provider-health', 'api-latency', 'api-error-rate'],
    observer: new InteractiveModelHealthObserver(input),
  }
}
