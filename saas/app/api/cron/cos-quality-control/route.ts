import { NextRequest, NextResponse } from 'next/server'
import {
  countPendingFailureAutopsyRetests,
  qualityBacklogIncident,
  qualityIncidentForSample,
  runAutomaticEvidenceUtilizationSample,
  runAutomaticPrivateCapabilitySample,
  type AutomaticQualitySample,
} from '@/lib/ai/cos/automaticQualityControl'
import { refreshAdaptiveRetrievalShadowCandidate } from '@/lib/ai/cos/adaptiveRetrievalPolicy'
import { runNextAdaptiveRetrievalValidation } from '@/lib/ai/cos/adaptiveRetrievalValidation'
import { remediateNativeIncidents } from '@/self-healing-host/native-autonomous-loop'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const UTILIZATION_START_BUDGET_MS = 110_000
const ADAPTIVE_START_BUDGET_MS = 165_000

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  return Boolean(secret && req.headers.get('authorization') === `Bearer ${secret}`)
}

function skippedSample(kind: AutomaticQualitySample['kind'], reason: string): AutomaticQualitySample {
  return { kind, runId: null, caseId: null, attempted: 0, passed: 0, scored: false, reasons: [], turnId: null, latencyMs: 0, error: reason }
}

async function maybeAdvanceAdaptiveRetrieval(elapsedMs: number) {
  if (elapsedMs >= ADAPTIVE_START_BUDGET_MS) return { status: 'skipped_budget' as const }
  try {
    const refreshed = await refreshAdaptiveRetrievalShadowCandidate()
    if (!refreshed.candidate.eligible) return { status: 'not_eligible' as const, reason: refreshed.candidate.reason }
    if (refreshed.policy?.status === 'validated_shadow') return { status: 'validated_shadow' as const, validation: null }
    if (refreshed.policy?.status === 'rejected') return { status: 'rejected' as const, validation: null }
    const validation = await runNextAdaptiveRetrievalValidation()
    return { status: 'validation_attempted' as const, validation }
  } catch (error) {
    return { status: 'error' as const, error: error instanceof Error ? error.message : String(error) }
  }
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  const startedAt = Date.now()
  const runAt = new Date().toISOString()

  const privateCapability = await runAutomaticPrivateCapabilitySample().catch(error =>
    skippedSample('private_capability', error instanceof Error ? error.message : String(error)))

  const evidenceUtilization = Date.now() - startedAt < UTILIZATION_START_BUDGET_MS
    ? await runAutomaticEvidenceUtilizationSample().catch(error =>
        skippedSample('evidence_utilization', error instanceof Error ? error.message : String(error)))
    : skippedSample('evidence_utilization', 'Skipped to preserve the bounded 300-second quality-control route budget.')

  const pendingBefore = await countPendingFailureAutopsyRetests().catch(() => 0)
  const sampleIncidents = [privateCapability, evidenceUtilization]
    .map(sample => qualityIncidentForSample(sample, runAt))
    .filter(Boolean)

  // One registered recovery can advance up to two retests. Do not create a second equivalent
  // backlog incident when a scored regression already carries the same pre-authorized action.
  const hasRegressionRecovery = sampleIncidents.some(incident => incident?.metadata?.recoveryPreauthorized === true)
  const backlogIncident = hasRegressionRecovery ? null : qualityBacklogIncident(pendingBefore, runAt)
  const incidents = [...sampleIncidents, ...(backlogIncident ? [backlogIncident] : [])]
  const remediation = incidents.length
    ? await remediateNativeIncidents(incidents, { maxIncidents: 1 }).catch(error => [{
        incidentId: incidents[0].incidentId,
        diagnosisConfidence: 0,
        diagnosis: 'Self-Healing remediation call failed before a governed outcome was returned.',
        repairSteps: 0,
        outcome: 'unavailable' as const,
        message: error instanceof Error ? error.message : String(error),
      }])
    : []

  const pendingAfter = await countPendingFailureAutopsyRetests().catch(() => pendingBefore)
  const adaptiveRetrieval = incidents.length === 0
    ? await maybeAdvanceAdaptiveRetrieval(Date.now() - startedAt)
    : { status: 'skipped_while_repairing' as const }

  const scoredFailures = [privateCapability, evidenceUtilization].filter(sample => sample.scored && sample.passed < sample.attempted).length
  const runtimeFailures = [privateCapability, evidenceUtilization].filter(sample => !sample.scored && !String(sample.error || '').startsWith('Skipped to preserve')).length

  return NextResponse.json({
    ok: true,
    schemaVersion: 'cos-automatic-quality-control-v1',
    runAt,
    automatic: true,
    healthy: scoredFailures === 0 && runtimeFailures === 0 && pendingAfter === 0,
    samples: { privateCapability, evidenceUtilization },
    incidents,
    remediation,
    failureAutopsy: { pendingBefore, pendingAfter },
    adaptiveRetrieval,
    durationMs: Date.now() - startedAt,
    semantics: 'Benchmarks run unattended. Scored regressions and autopsy backlogs enter the existing Self-Healing Supervisor. Only the exact registered reversible recovery may auto-execute; consequential actions remain governed by the existing Agent Gateway policy.',
  })
}

export async function POST(req: NextRequest) { return GET(req) }
