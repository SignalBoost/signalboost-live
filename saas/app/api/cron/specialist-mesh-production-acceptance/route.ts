import { createHash } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { getAdminSupabase } from '@/utils/supabase/server'
import { resolveSpecialistMeshAcceptanceControlSecret } from '@/a2a-host/specialist-mesh-acceptance-control'
import {
  SPECIALIST_MESH_PRODUCTION_LIVE_ACCEPTANCE_VERSION,
  runSpecialistMeshProductionLiveAcceptance,
} from '@/a2a-host/specialist-mesh-production-live-acceptance'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const SPECIALIST_MESH_PRODUCTION_DEPLOYMENT_BINDING_EVENT = 'specialist_mesh_live_acceptance_deployment_bound' as const

function deploymentFingerprint(): string {
  const deploymentUrl = String(process.env.VERCEL_URL ?? '').trim()
  if (!deploymentUrl) throw new Error('specialist_mesh_acceptance_deployment_unavailable')
  return `sha256:${createHash('sha256').update(deploymentUrl, 'utf8').digest('hex')}`
}

export async function GET(req: NextRequest) {
  const cronSecret = String(process.env.CRON_SECRET ?? '').trim()
  if (!cronSecret || req.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ ok: false, error: 'unauthorized_cron' }, { status: 401 })
  }
  if (process.env.VERCEL_ENV !== 'production') {
    return NextResponse.json({ ok: false, error: 'specialist_mesh_acceptance_production_only' }, { status: 409 })
  }

  const productionCommit = String(process.env.VERCEL_GIT_COMMIT_SHA ?? '').trim()
  if (!productionCommit) return NextResponse.json({ ok: false, error: 'specialist_mesh_acceptance_commit_unavailable' }, { status: 503 })

  let productionDeploymentFingerprint: string
  let failureControlSecret: string
  try {
    productionDeploymentFingerprint = deploymentFingerprint()
    failureControlSecret = resolveSpecialistMeshAcceptanceControlSecret()
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'specialist_mesh_acceptance_server_control_unavailable'
    return NextResponse.json({ ok: false, error: reason }, { status: 503, headers: { 'cache-control': 'no-store' } })
  }

  const db = getAdminSupabase()
  const existing = await db.from('supervisor_audit_events')
    .select('event_id,occurred_at,payload')
    .eq('event_type', SPECIALIST_MESH_PRODUCTION_DEPLOYMENT_BINDING_EVENT)
    .contains('payload', { productionCommit, productionDeploymentFingerprint })
    .order('occurred_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (existing.error) return NextResponse.json({ ok: false, error: 'specialist_mesh_acceptance_evidence_lookup_failed' }, { status: 503 })
  if (existing.data) {
    const payload = existing.data.payload && typeof existing.data.payload === 'object' ? existing.data.payload as Record<string, unknown> : {}
    return NextResponse.json({
      ok: true,
      alreadyAccepted: true,
      eventId: payload.acceptanceEventId ?? null,
      deploymentBindingEventId: existing.data.event_id,
      acceptedAt: payload.acceptedAt ?? existing.data.occurred_at,
      productionCommit,
      acceptanceClass: payload.acceptanceClass ?? 'signalboost-production-live',
      buyerAccepted: false,
    }, { headers: { 'cache-control': 'no-store' } })
  }

  try {
    const result = await runSpecialistMeshProductionLiveAcceptance({
      db,
      failureControlSecret,
      productionCommit,
    })
    const bindingEventId = `specialist-mesh-production-live-binding-${result.evidence.runId}`
    const bindingPayload = Object.freeze({
      acceptanceEventId: result.eventId,
      acceptedAt: result.evidence.acceptedAt,
      productionCommit,
      productionDeploymentFingerprint,
      acceptanceClass: result.evidence.acceptanceClass,
      buyerAccepted: false,
    })
    const { error: bindingError } = await db.from('supervisor_audit_events').insert({
      event_id: bindingEventId,
      execution_id: result.evidence.runId,
      incident_id: result.evidence.ownership.workItemId,
      event_type: SPECIALIST_MESH_PRODUCTION_DEPLOYMENT_BINDING_EVENT,
      occurred_at: result.evidence.acceptedAt,
      payload: bindingPayload,
      schema_version: SPECIALIST_MESH_PRODUCTION_LIVE_ACCEPTANCE_VERSION,
    })
    if (bindingError) throw new Error('specialist_mesh_acceptance_deployment_binding_failed')

    return NextResponse.json({
      ok: true,
      alreadyAccepted: false,
      eventId: result.eventId,
      deploymentBindingEventId: bindingEventId,
      acceptedAt: result.evidence.acceptedAt,
      productionCommit: result.evidence.productionCommit,
      acceptanceClass: result.evidence.acceptanceClass,
      buyerAccepted: false,
      primaryAgentId: result.evidence.routing.primaryAgentId,
      fallbackAgentId: result.evidence.routing.fallbackAgentId,
      firstFencingToken: result.evidence.ownership.firstFencingToken,
      secondFencingToken: result.evidence.ownership.secondFencingToken,
      staleFirstOwnerRejected: result.evidence.ownership.staleFirstOwnerRejected,
      completionTransitions: result.evidence.ownership.completionTransitions,
    }, { headers: { 'cache-control': 'no-store' } })
  } catch (error) {
    const reason = error instanceof Error ? error.message.split(':')[0] : 'specialist_mesh_acceptance_failed'
    return NextResponse.json({ ok: false, error: reason }, { status: 503, headers: { 'cache-control': 'no-store' } })
  }
}
