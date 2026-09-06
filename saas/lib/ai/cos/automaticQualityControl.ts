import { incidentSchema, type SupervisorIncident } from '@/lib/supervisor/incident-schema'
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import { runPrivateCapabilityCase } from '@/lib/ai/cos/capabilityBenchmarkRunner'
import { isPrivateCapabilityAcceptanceOrigin } from '@/lib/ai/cos/capabilityBenchmarkCohort'
import { COS_EVIDENCE_UTILIZATION_BENCHMARK } from '@/lib/ai/cos/evidenceUtilizationBenchmark'
import {
  COS_QUALITY_AUTOPSY_BACKLOG_ERROR_CODE,
  COS_QUALITY_RECOVERY_TARGET,
  COS_QUALITY_REGRESSION_ERROR_CODE,
  COS_QUALITY_RUNTIME_ERROR_CODE,
} from '@/agent-gateway-host/cos-quality-recovery'

export type AutomaticQualitySample = {
  kind: 'private_capability' | 'evidence_utilization'
  runId: string | null
  caseId: string | null
  attempted: number
  passed: number
  scored: boolean
  reasons: string[]
  turnId: string | null
  latencyMs: number
  error: string | null
}

function terms(value: unknown): string[] {
  return Array.isArray(value) ? value.map(item => String(item)).filter(Boolean) : []
}

function errorText(error: unknown): string {
  return (error instanceof Error ? error.message : String(error ?? 'Unknown quality-control error')).slice(0, 1800)
}

async function failRun(db: any, table: string, runId: string, error: string): Promise<void> {
  await db.from(table).update({
    status: 'failed',
    completed_at: new Date().toISOString(),
    attempted: 0,
    passed: 0,
    error: error.slice(0, 2000),
  }).eq('id', runId)
}

export async function runAutomaticPrivateCapabilitySample(): Promise<AutomaticQualitySample> {
  const db = cosServiceDb()
  if (!db) return { kind: 'private_capability', runId: null, caseId: null, attempted: 0, passed: 0, scored: false, reasons: [], turnId: null, latencyMs: 0, error: 'COS service database is not configured.' }

  const [cases, completedRuns] = await Promise.all([
    db.from('cos_capability_benchmark_cases')
      .select('id,track,prompt,required_terms,forbidden_terms,requires_local_reasoning,origin,created_at')
      .eq('active', true)
      .order('created_at', { ascending: true })
      .limit(200),
    db.from('cos_capability_benchmark_runs').select('id').eq('status', 'completed').limit(5000),
  ])
  if (cases.error || completedRuns.error) throw new Error(cases.error?.message ?? completedRuns.error?.message)
  const active = (cases.data ?? []).filter(row => isPrivateCapabilityAcceptanceOrigin(row.origin))
  if (!active.length) return { kind: 'private_capability', runId: null, caseId: null, attempted: 0, passed: 0, scored: false, reasons: [], turnId: null, latencyMs: 0, error: 'No active private capability cases are available.' }

  const index = (completedRuns.data?.length ?? 0) % active.length
  const row = active[index]
  const run = await db.from('cos_capability_benchmark_runs').insert({ requested_limit: 1 }).select('id').single()
  if (run.error || !run.data?.id) throw new Error(run.error?.message ?? 'Could not create automatic private benchmark run.')
  const runId = String(run.data.id)

  try {
    const outcome = await runPrivateCapabilityCase({
      id: String(row.id),
      track: String(row.track),
      prompt: String(row.prompt),
      requiredTerms: terms(row.required_terms),
      forbiddenTerms: terms(row.forbidden_terms),
      requiresProvenance: true,
      requiresLocalReasoning: Boolean(row.requires_local_reasoning),
    }, { outcomeSource: `capability_benchmark:${String(row.track)}` })

    const inserted = await db.from('cos_capability_benchmark_results').insert({
      run_id: runId,
      case_id: row.id,
      track: row.track,
      passed: outcome.score.passed,
      reasons: outcome.score.reasons,
      response_excerpt: outcome.replyExcerpt,
      response_source: outcome.provenance.responseSource,
      local_model_invoked: outcome.provenance.localModelInvoked,
      external_ai_invoked: outcome.provenance.externalAiInvoked,
      latency_ms: outcome.latencyMs,
      turn_id: outcome.turnId,
    })
    if (inserted.error) throw inserted.error
    await db.from('cos_capability_benchmark_runs').update({
      status: 'completed', completed_at: new Date().toISOString(), attempted: 1, passed: outcome.score.passed ? 1 : 0, error: null,
    }).eq('id', runId)
    return {
      kind: 'private_capability', runId, caseId: String(row.id), attempted: 1, passed: outcome.score.passed ? 1 : 0,
      scored: true, reasons: outcome.score.reasons, turnId: outcome.turnId ?? null, latencyMs: outcome.latencyMs, error: null,
    }
  } catch (error) {
    const message = errorText(error)
    await failRun(db, 'cos_capability_benchmark_runs', runId, `Automatic quality sample could not be scored: ${message}`)
    return { kind: 'private_capability', runId, caseId: String(row.id), attempted: 0, passed: 0, scored: false, reasons: [], turnId: null, latencyMs: 0, error: message }
  }
}

export async function runAutomaticEvidenceUtilizationSample(): Promise<AutomaticQualitySample> {
  const db = cosServiceDb()
  if (!db) return { kind: 'evidence_utilization', runId: null, caseId: null, attempted: 0, passed: 0, scored: false, reasons: [], turnId: null, latencyMs: 0, error: 'COS service database is not configured.' }

  const completedRuns = await db.from('cos_evidence_utilization_benchmark_runs').select('attempted').eq('status', 'completed').limit(5000)
  if (completedRuns.error) throw completedRuns.error
  const completedAttempts = (completedRuns.data ?? []).reduce((sum, row) => sum + Math.max(0, Number(row.attempted) || 0), 0)
  const test = COS_EVIDENCE_UTILIZATION_BENCHMARK[completedAttempts % COS_EVIDENCE_UTILIZATION_BENCHMARK.length]
  if (!test) return { kind: 'evidence_utilization', runId: null, caseId: null, attempted: 0, passed: 0, scored: false, reasons: [], turnId: null, latencyMs: 0, error: 'Evidence-utilization suite is empty.' }

  const run = await db.from('cos_evidence_utilization_benchmark_runs').insert({ requested_limit: 1 }).select('id').single()
  if (run.error || !run.data?.id) throw new Error(run.error?.message ?? 'Could not create automatic utilization benchmark run.')
  const runId = String(run.data.id)

  try {
    const outcome = await runPrivateCapabilityCase(test, { outcomeSource: `evidence_utilization_benchmark:${test.id}` })
    const inserted = await db.from('cos_evidence_utilization_benchmark_results').insert({
      run_id: runId,
      case_id: test.id,
      domain: test.domain,
      passed: outcome.score.passed,
      reasons: outcome.score.reasons,
      turn_id: outcome.turnId,
      response_excerpt: outcome.replyExcerpt,
      latency_ms: outcome.latencyMs,
    })
    if (inserted.error) throw inserted.error
    await db.from('cos_evidence_utilization_benchmark_runs').update({
      status: 'completed', completed_at: new Date().toISOString(), attempted: 1, passed: outcome.score.passed ? 1 : 0, error: null,
    }).eq('id', runId)
    return {
      kind: 'evidence_utilization', runId, caseId: test.id, attempted: 1, passed: outcome.score.passed ? 1 : 0,
      scored: true, reasons: outcome.score.reasons, turnId: outcome.turnId ?? null, latencyMs: outcome.latencyMs, error: null,
    }
  } catch (error) {
    const message = errorText(error)
    await failRun(db, 'cos_evidence_utilization_benchmark_runs', runId, `Automatic quality sample could not be scored: ${message}`)
    return { kind: 'evidence_utilization', runId, caseId: test.id, attempted: 0, passed: 0, scored: false, reasons: [], turnId: null, latencyMs: 0, error: message }
  }
}

export async function countPendingFailureAutopsyRetests(): Promise<number> {
  const db = cosServiceDb()
  if (!db) return 0
  const result = await db.from('cos_turn_failure_autopsies').select('id', { count: 'exact', head: true }).eq('status', 'retest_pending')
  if (result.error) throw result.error
  return Number(result.count ?? 0)
}

function incidentIdPart(value: unknown): string {
  return String(value ?? '').replace(/[^A-Za-z0-9._:-]+/g, '-').slice(0, 120) || 'unknown'
}

export function qualityIncidentForSample(sample: AutomaticQualitySample, detectedAt = new Date().toISOString()): SupervisorIncident | null {
  if (sample.scored && sample.passed === sample.attempted) return null
  const regression = sample.scored && sample.attempted > 0 && sample.passed < sample.attempted
  const errorCode = regression ? COS_QUALITY_REGRESSION_ERROR_CODE : COS_QUALITY_RUNTIME_ERROR_CODE
  const preauthorized = regression
  const metadata: Record<string, any> = {
    nativeProbe: sample.kind === 'private_capability' ? 'cos_private_capability_benchmark' : 'cos_evidence_utilization_benchmark',
    benchmarkKind: sample.kind,
    runId: sample.runId,
    caseId: sample.caseId,
    scored: sample.scored,
    reasons: sample.reasons.slice(0, 12),
    turnId: sample.turnId,
    ...(preauthorized ? { registeredRecoveryAction: COS_QUALITY_RECOVERY_TARGET, recoveryPreauthorized: true } : {}),
  }
  return incidentSchema.parse({
    incidentId: `cos-quality-${incidentIdPart(sample.kind)}-${incidentIdPart(sample.runId || detectedAt)}`,
    provider: 'cos-quality',
    environment: 'production',
    severity: regression ? 'warning' : 'critical',
    detectedAt,
    source: 'cron',
    errorCode,
    errorMessage: regression
      ? `${sample.kind} scored a regression (${sample.passed}/${sample.attempted} passed). The registered recovery is limited to independent failure-autopsy retests and evidence-gated cognitive skill reconciliation.`
      : `${sample.kind} could not be scored automatically: ${sample.error || 'unknown runtime failure'}`,
    affectedResource: 'cos-reasoning-quality',
    evidence: [{
      evidenceId: `quality-${incidentIdPart(sample.runId || detectedAt)}`,
      type: 'benchmark_result',
      capturedAt: detectedAt,
      summary: regression ? `${sample.caseId}: ${sample.reasons.join('; ').slice(0, 900) || 'scored failure'}` : String(sample.error || 'unscored benchmark failure').slice(0, 900),
      reference: '/dashboard/cos-capability-benchmark',
    }],
    metadata,
  })
}

export function qualityBacklogIncident(pendingRetests: number, detectedAt = new Date().toISOString()): SupervisorIncident | null {
  const pending = Math.max(0, Math.floor(Number(pendingRetests) || 0))
  if (!pending) return null
  const day = detectedAt.slice(0, 10)
  return incidentSchema.parse({
    incidentId: `cos-quality-autopsy-backlog-${day}`,
    provider: 'cos-quality',
    environment: 'production',
    severity: 'warning',
    detectedAt,
    source: 'cron',
    errorCode: COS_QUALITY_AUTOPSY_BACKLOG_ERROR_CODE,
    errorMessage: `${pending} failure-autopsy retests are pending. Advance a bounded batch through the registered recovery, then reconcile repeated clean outcomes into the existing cognitive-skill lifecycle.`,
    affectedResource: 'cos-failure-autopsy',
    evidence: [{ evidenceId: `quality-backlog-${day}`, type: 'quality_backlog', capturedAt: detectedAt, summary: `${pending} pending independent retests`, reference: '/dashboard/cos-capability-benchmark' }],
    metadata: {
      nativeProbe: 'cos_failure_autopsy_backlog',
      pendingRetests: pending,
      registeredRecoveryAction: COS_QUALITY_RECOVERY_TARGET,
      recoveryPreauthorized: true,
    },
  })
}
