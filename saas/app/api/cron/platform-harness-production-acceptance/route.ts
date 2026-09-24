// saas/app/api/cron/platform-harness-production-acceptance/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import {
  PLATFORM_HARNESS_PRODUCTION_ACCEPTANCE_EVENT,
  runPlatformHarnessProductionAcceptance,
} from '@/platform-harness/acceptance/production-canary'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

function productionIdentity() {
  const productionCommit = String(process.env.VERCEL_GIT_COMMIT_SHA || '').trim()
  const productionDeploymentFingerprint = String(
    process.env.VERCEL_DEPLOYMENT_ID || process.env.VERCEL_URL || productionCommit,
  ).trim()
  return { productionCommit, productionDeploymentFingerprint }
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization') || ''
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }
  if (process.env.VERCEL_ENV !== 'production') {
    return NextResponse.json({ ok: false, error: 'production_environment_required' }, { status: 409 })
  }

  const db = cosServiceDb()
  if (!db) return NextResponse.json({ ok: false, error: 'service_database_unavailable' }, { status: 503 })

  const identity = productionIdentity()
  if (!identity.productionCommit || !identity.productionDeploymentFingerprint) {
    return NextResponse.json({ ok: false, error: 'production_deployment_identity_unavailable' }, { status: 503 })
  }

  const { data: recent, error: recentError } = await db.from('supervisor_audit_events')
    .select('event_id,payload,occurred_at')
    .eq('event_type', PLATFORM_HARNESS_PRODUCTION_ACCEPTANCE_EVENT)
    .order('occurred_at', { ascending: false })
    .limit(20)
  if (recentError) {
    return NextResponse.json({ ok: false, error: 'platform_harness_acceptance_history_unavailable' }, { status: 503 })
  }

  const alreadyAccepted = (recent || []).find((row: any) =>
    String(row?.payload?.productionCommit || '') === identity.productionCommit
    && String(row?.payload?.productionDeploymentFingerprint || '') === identity.productionDeploymentFingerprint
  )
  if (alreadyAccepted) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: 'deployment_already_accepted',
      productionCommit: identity.productionCommit,
      productionDeploymentFingerprint: identity.productionDeploymentFingerprint,
      acceptanceEventId: alreadyAccepted.event_id,
      acceptedAt: alreadyAccepted.occurred_at,
    })
  }

  try {
    const result = await runPlatformHarnessProductionAcceptance({
      db: db as any,
      ...identity,
    })
    return NextResponse.json({ ok: true, skipped: false, ...result })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'platform_harness_production_acceptance_failed'
    console.error('[platform-harness-production-acceptance]', message)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
