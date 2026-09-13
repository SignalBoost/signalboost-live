import { createHash } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { getAdminSupabase } from '@/utils/supabase/server'
import {
  SPECIALIST_MESH_UNIVERSITY_COVERAGE_VERSION,
  runSpecialistMeshUniversityCoverage,
} from '@/a2a-host/specialist-mesh-university-coverage'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const EVENT_TYPE = 'specialist_mesh_university_coverage_cycle' as const

function deploymentFingerprint(): string | null {
  const deploymentUrl = String(process.env.VERCEL_URL ?? '').trim()
  if (!deploymentUrl) return null
  return `sha256:${createHash('sha256').update(deploymentUrl, 'utf8').digest('hex')}`
}

export async function GET(req: NextRequest) {
  const cronSecret = String(process.env.CRON_SECRET ?? '').trim()
  if (!cronSecret || req.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ ok: false, error: 'unauthorized_cron' }, { status: 401 })
  }
  if (process.env.VERCEL_ENV !== 'production') {
    return NextResponse.json({ ok: false, error: 'specialist_mesh_university_coverage_production_only' }, { status: 409 })
  }

  const db = getAdminSupabase()
  const productionCommit = String(process.env.VERCEL_GIT_COMMIT_SHA ?? '').trim() || null
  const productionDeploymentFingerprint = deploymentFingerprint()

  try {
    const result = await runSpecialistMeshUniversityCoverage({ db, maxNewStudyPlans: 1 })
    const hour = new Date().toISOString().slice(0, 13)
    const eventId = `specialist-mesh-university-coverage-${createHash('sha256')
      .update(`${productionCommit ?? 'unknown'}|${hour}`, 'utf8').digest('hex').slice(0, 32)}`
    const payload = Object.freeze({
      version: result.version,
      productionCommit,
      productionDeploymentFingerprint,
      enabled: result.enabled,
      configuredCapabilities: result.configuredCapabilities,
      coveredCapabilities: result.coveredCapabilities,
      gaps: result.gaps,
      trainingPriorities: result.trainingPriorities,
      authorizationGaps: result.authorizationGaps,
      unassignedGaps: result.unassignedGaps,
      studyPlansCreated: result.studyPlansCreated,
      errorCount: result.errors.length,
      authorityExpanded: false,
      qualificationGranted: false,
      credentialGranted: false,
      semantics: result.semantics,
    })
    const audit = await db.from('supervisor_audit_events').upsert({
      event_id: eventId,
      execution_id: eventId,
      incident_id: null,
      event_type: EVENT_TYPE,
      occurred_at: new Date().toISOString(),
      payload,
      schema_version: SPECIALIST_MESH_UNIVERSITY_COVERAGE_VERSION,
    }, { onConflict: 'event_id', ignoreDuplicates: true })
    if (audit.error) throw new Error('specialist_mesh_university_coverage_audit_failed')

    return NextResponse.json({ ok: result.errors.length === 0, ...payload, errors: result.errors }, {
      status: result.errors.length === 0 ? 200 : 503,
      headers: { 'cache-control': 'no-store' },
    })
  } catch (error) {
    const reason = error instanceof Error ? error.message.split(':')[0] : 'specialist_mesh_university_coverage_failed'
    return NextResponse.json({ ok: false, error: reason }, { status: 503, headers: { 'cache-control': 'no-store' } })
  }
}
