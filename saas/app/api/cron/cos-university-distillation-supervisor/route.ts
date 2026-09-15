import { NextRequest, NextResponse } from 'next/server'
import { getAdminSupabase } from '@/utils/supabase/server'
import { runNativeMonitoring } from '@/self-healing-host/native-monitoring-runtime'
import { remediateNativeIncidents } from '@/self-healing-host/native-autonomous-loop'
import { universityMassDistillationMonitoringCollector } from '@/self-healing-host/university-distillation-monitoring'
import { recordCosUniversityProductionPath } from '@/lib/ai/cos/cosUniversityProductionAssurance'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  return Boolean(secret && req.headers.get('authorization') === `Bearer ${secret}`)
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  const nativeEnabled = process.env.SELF_HEALING_NATIVE_MONITORING_ENABLED !== 'false'
  try {
    const db = getAdminSupabase()
    const monitoring = await runNativeMonitoring({
      context: {
        provider: 'signalboost-cos-university',
        environment: 'production',
        metadata: {
          source: 'cos-university-distillation-supervisor-cron',
          observationOnly: true,
        },
      },
      collectors: [universityMassDistillationMonitoringCollector({ db })],
      nativeEnabled,
      externalConnected: process.env.SELF_HEALING_EXTERNAL_MONITORING_CONNECTED === 'true',
    })
    const remediation = monitoring.incidents.length
      ? await remediateNativeIncidents(monitoring.incidents, { maxIncidents: 1 })
      : []
    const repairIncomplete = monitoring.incidents.length > 0
      && (remediation.length !== monitoring.incidents.length
        || remediation.some(result => result.outcome !== 'executed'))
    const ok = nativeEnabled && monitoring.collectorErrors.length === 0 && !repairIncomplete
    const runAt = new Date().toISOString()
    await recordCosUniversityProductionPath({
      path: 'mass_distillation_supervision',
      invocationSucceeded: ok,
      evidence: {
        runnerInvoked: true,
        runAt,
        monitorReadOnly: monitoring.readOnly,
        repairGoverned: true,
        mode: monitoring.mode,
        collectorsRun: monitoring.collectorsRun,
        signalsObserved: monitoring.signalsObserved,
        incidentsObserved: monitoring.incidents.length,
        remediationOutcomes: remediation.map(result => result.outcome),
        collectorErrors: monitoring.collectorErrors,
        repairIncomplete,
        automaticPromotionAuthorized: false,
        runpodMutationAuthorized: false,
        authorityExpanded: false,
      },
    })

    return NextResponse.json({
      ok,
      schemaVersion: 'cos-university-distillation-supervisor-v1',
      runAt,
      monitorReadOnly: monitoring.readOnly,
      repairGoverned: true,
      mode: monitoring.mode,
      collectorsRun: monitoring.collectorsRun,
      signalsObserved: monitoring.signalsObserved,
      incidents: monitoring.incidents,
      remediation,
      collectorErrors: monitoring.collectorErrors,
      automaticPromotionAuthorized: false,
      runpodMutationAuthorized: false,
      authorityExpanded: false,
    }, {
      status: ok ? 200 : 503,
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await recordCosUniversityProductionPath({
      path: 'mass_distillation_supervision',
      invocationSucceeded: false,
      evidence: { error: message, runnerInvoked: true },
    }).catch(() => null)
    console.error('[cos-university-distillation-supervisor]', JSON.stringify({ ok: false, error: message }))
    return NextResponse.json({
      ok: false,
      schemaVersion: 'cos-university-distillation-supervisor-v1',
      error: message,
    }, {
      status: 500,
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    })
  }
}

export async function POST(req: NextRequest) {
  return GET(req)
}
