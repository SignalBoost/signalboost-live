import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'node:crypto'
import { getAdminSupabase } from '@/utils/supabase/server'
import { createSupervisorCoordinationStore } from '@/lib/supervisor/coordination'
import { verifyGitHubWebhookSignature } from '@/lib/provider-framework/github'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const MAX_BODY_BYTES = 256 * 1024
const supportedEvents = new Set(['push','pull_request','pull_request_review','workflow_run','check_suite','check_run','repository','installation','installation_repositories'])

export async function POST(req: NextRequest) {
  const body = await req.text()
  if (Buffer.byteLength(body, 'utf8') > MAX_BODY_BYTES) return NextResponse.json({ ok: false, error: { code: 'body_too_large' } }, { status: 413 })
  const secret = process.env.GITHUB_WEBHOOK_SECRET
  if (!secret) return NextResponse.json({ ok: false, error: { code: 'webhook_not_configured' } }, { status: 503 })
  const signature = req.headers.get('x-hub-signature-256')
  if (!signature || !verifyGitHubWebhookSignature(secret, body, signature)) return NextResponse.json({ ok: false, error: { code: 'invalid_signature' } }, { status: 401 })
  const deliveryId = req.headers.get('x-github-delivery')
  const event = req.headers.get('x-github-event')
  if (!deliveryId) return NextResponse.json({ ok: false, error: { code: 'missing_delivery' } }, { status: 400 })
  if (!event || !supportedEvents.has(event)) return NextResponse.json({ ok: false, error: { code: 'unsupported_event' } }, { status: 400 })

  let payload: any
  try { payload = JSON.parse(body) } catch { return NextResponse.json({ ok: false, error: { code: 'malformed_body' } }, { status: 400 }) }
  const repositoryFullName = String(payload?.repository?.full_name || '')
  const organizationId = String(payload?.installation?.account?.id || payload?.organization?.id || process.env.GITHUB_PROVIDER_ORGANIZATION_ID || '')
  if (!repositoryFullName || !organizationId) return NextResponse.json({ ok: false, error: { code: 'provider_identity_not_authorized' } }, { status: 400 })

  const db = getAdminSupabase()
  const delivery = {
    delivery_id: deliveryId,
    event_type: event,
    organization_id: organizationId,
    repository_full_name: repositoryFullName,
    payload_digest: createHash('sha256').update(body).digest('hex'),
    status: 'accepted_not_processed_yet',
    received_at: new Date().toISOString(),
  }
  const inserted = await db.from('github_webhook_deliveries').insert(delivery)
  if (inserted.error) {
    if (String(inserted.error.code || inserted.error.message).includes('23505') || String(inserted.error.message).toLowerCase().includes('duplicate')) {
      return NextResponse.json({ ok: true, outcome: 'duplicate', deliveryId, readOnly: true, repairAttempted: false }, { status: 200 })
    }
    return NextResponse.json({ ok: false, outcome: 'deferred', error: { code: 'delivery_persistence_failed' } }, { status: 503 })
  }

  let coordinationStore
  try { coordinationStore = createSupervisorCoordinationStore({ supabase: db, runtime: process.env.NODE_ENV as any }) }
  catch { return NextResponse.json({ ok: false, outcome: 'deferred', error: { code: 'coordination_unavailable' } }, { status: 503 }) }

  const workItemId = `github-webhook:${organizationId}:${event}:${deliveryId}`
  try {
    await coordinationStore.enqueueWorkItem({
      workItemId,
      workItemType: 'github_observation',
      incidentId: workItemId,
      provider: 'github',
      organizationId,
      projectId: repositoryFullName.split('/')[0],
      resourceId: repositoryFullName.split('/')[1],
      environment: 'production',
      state: 'queued',
      priority: 80,
      createdAt: new Date().toISOString(),
      availableAt: new Date().toISOString(),
      attempt: 0,
      maxAttempts: 3,
      policyVersion: 'mission001-github-readonly-v1',
      capabilityVersion: event === 'workflow_run' ? 'github.workflow_runs.read' : 'github.repository.read',
      adapterVersion: 'github-readonly-v1',
      schemaVersion: 'supervisor-work-item-v1',
    })
  } catch (error: any) {
    if (!String(error?.code || error?.message).includes('conflict')) {
      await db.from('github_webhook_deliveries').update({ status: 'deferred', reason_code: 'coordination_unavailable' }).eq('delivery_id', deliveryId)
      return NextResponse.json({ ok: false, outcome: 'deferred', error: { code: 'coordination_unavailable' } }, { status: 503 })
    }
  }
  await db.from('github_webhook_deliveries').update({ status: 'queued', work_item_id: workItemId }).eq('delivery_id', deliveryId)
  return NextResponse.json({
    ok: true,
    schemaVersion: 'github-webhook-accepted-v1',
    outcome: 'accepted_not_processed_yet',
    workItemId,
    deliveryId,
    readOnly: true,
    repairAttempted: false,
    providerMutations: false,
    productionBrowserExecution: false,
  }, { status: 202 })
}
