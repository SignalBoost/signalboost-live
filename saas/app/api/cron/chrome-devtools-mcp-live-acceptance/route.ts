// saas/app/api/cron/chrome-devtools-mcp-live-acceptance/route.ts
import { createHash } from 'node:crypto'
import { NextResponse } from 'next/server'
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import { runChromeDevtoolsMcpProductionAcceptance } from '@/provider-hub-host/chrome-devtools-mcp-sandbox-acceptance'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 240

const CHROME_DEVTOOLS_MCP_PRODUCTION_ACCEPTANCE_EVENT =
  'chrome_devtools_mcp_production_acceptance_completed' as const

function productionIdentity() {
  const productionCommit = String(process.env.VERCEL_GIT_COMMIT_SHA || '').trim()
  const productionDeploymentFingerprint = String(
    process.env.VERCEL_DEPLOYMENT_ID || process.env.VERCEL_URL || productionCommit,
  ).trim()
  return { productionCommit, productionDeploymentFingerprint }
}

function acceptanceEventId(productionCommit: string, productionDeploymentFingerprint: string): string {
  const digest = createHash('sha256')
    .update(`${productionCommit}\n${productionDeploymentFingerprint}`)
    .digest('hex')
    .slice(0, 40)
  return `chrome-devtools-mcp-production-acceptance-${digest}`
}

export async function GET(request: Request) {
  if (process.env.VERCEL_ENV !== 'production') {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const db = cosServiceDb()
  if (!db) {
    return NextResponse.json({ ok: false, error: 'service_database_unavailable' }, { status: 503 })
  }

  const identity = productionIdentity()
  if (!identity.productionCommit || !identity.productionDeploymentFingerprint) {
    return NextResponse.json({ ok: false, error: 'production_deployment_identity_unavailable' }, { status: 503 })
  }

  const { data: recent, error: recentError } = await db.from('supervisor_audit_events')
    .select('event_id,payload,occurred_at')
    .eq('event_type', CHROME_DEVTOOLS_MCP_PRODUCTION_ACCEPTANCE_EVENT)
    .order('occurred_at', { ascending: false })
    .limit(50)
  if (recentError) {
    return NextResponse.json({ ok: false, error: 'chrome_devtools_mcp_acceptance_history_unavailable' }, { status: 503 })
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
      ...identity,
      acceptanceEventId: alreadyAccepted.event_id,
      acceptedAt: alreadyAccepted.occurred_at,
    })
  }

  const result = await runChromeDevtoolsMcpProductionAcceptance()
  console.info('[chrome_devtools_mcp_production_acceptance]', {
    ok: result.ok,
    schemaVersion: result.schemaVersion,
    packageName: result.packageName,
    packageVersion: result.packageVersion,
    commitSha: identity.productionCommit.slice(0, 12),
    deploymentFingerprint: identity.productionDeploymentFingerprint.slice(0, 80),
    checks: result.checks,
  })

  if (!result.ok) {
    return NextResponse.json({ ...result, skipped: false, ...identity }, { status: 503 })
  }

  const acceptedAt = new Date().toISOString()
  const eventId = acceptanceEventId(identity.productionCommit, identity.productionDeploymentFingerprint)
  const payload = {
    schemaVersion: result.schemaVersion,
    acceptedAt,
    ...identity,
    packageName: result.packageName,
    packageVersion: result.packageVersion,
    transport: result.transport,
    checks: result.checks,
    privacy: result.privacy,
  }
  const { error: auditError } = await db.from('supervisor_audit_events').upsert({
    event_id: eventId,
    execution_id: eventId,
    incident_id: eventId,
    event_type: CHROME_DEVTOOLS_MCP_PRODUCTION_ACCEPTANCE_EVENT,
    occurred_at: acceptedAt,
    payload,
    schema_version: result.schemaVersion,
  }, { onConflict: 'event_id', ignoreDuplicates: true })
  if (auditError) {
    return NextResponse.json({
      ...result,
      ok: false,
      skipped: false,
      error: 'chrome_devtools_mcp_acceptance_evidence_persist_failed',
      ...identity,
    }, { status: 503 })
  }

  return NextResponse.json({
    ...result,
    skipped: false,
    ...identity,
    acceptanceEventId: eventId,
    acceptedAt,
  })
}