import { NextRequest, NextResponse } from 'next/server'
import { getAdminSupabase } from '@/utils/supabase/server'
import {
  SPECIALIST_MESH_PRODUCTION_ACCEPTANCE_EVENT,
  runSpecialistMeshProductionLiveAcceptance,
} from '@/a2a-host/specialist-mesh-production-live-acceptance'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const secret = String(process.env.CRON_SECRET ?? '').trim()
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: 'unauthorized_cron' }, { status: 401 })
  }
  if (process.env.VERCEL_ENV !== 'production') {
    return NextResponse.json({ ok: false, error: 'specialist_mesh_acceptance_production_only' }, { status: 409 })
  }

  const db = getAdminSupabase()
  const existing = await db.from('supervisor_audit_events')
    .select('event_id,occurred_at,payload')
    .eq('event_type', SPECIALIST_MESH_PRODUCTION_ACCEPTANCE_EVENT)
    .order('occurred_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (existing.error) return NextResponse.json({ ok: false, error: 'specialist_mesh_acceptance_evidence_lookup_failed' }, { status: 503 })
  if (existing.data) {
    const payload = existing.data.payload && typeof existing.data.payload === 'object' ? existing.data.payload as Record<string, unknown> : {}
    return NextResponse.json({
      ok: true,
      alreadyAccepted: true,
      eventId: existing.data.event_id,
      acceptedAt: existing.data.occurred_at,
      productionCommit: payload.productionCommit ?? null,
      acceptanceClass: payload.acceptanceClass ?? 'signalboost-production-live',
      buyerAccepted: false,
    }, { headers: { 'cache-control': 'no-store' } })
  }

  const productionCommit = String(process.env.VERCEL_GIT_COMMIT_SHA ?? '').trim()
  if (!productionCommit) return NextResponse.json({ ok: false, error: 'specialist_mesh_acceptance_commit_unavailable' }, { status: 503 })

  try {
    const result = await runSpecialistMeshProductionLiveAcceptance({
      db,
      failureControlSecret: secret,
      productionCommit,
    })
    return NextResponse.json({
      ok: true,
      alreadyAccepted: false,
      eventId: result.eventId,
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
