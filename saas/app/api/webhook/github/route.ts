import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'node:crypto'
import { getAdminSupabase } from '@/utils/supabase/server'
import { createSupervisorCoordinationStore } from '@/lib/supervisor/coordination'
import { createSupabaseRepositoryPatrolStore } from '@/lib/security/repository-patrol-store'
import {
  ingestDurableRepositoryPatrolEvent,
  normalizeAuthenticatedGitHubRepositoryWebhook,
  verifyGitHubWebhookDelivery,
  type SignedSecurityEngagement,
  type TrustedSecurityEngagementKeys,
} from '@/security-host/index'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const MAX_BODY_BYTES = 256 * 1024
const supportedEvents = new Set(['push','pull_request','pull_request_review','workflow_run','check_suite','check_run','repository','installation','installation_repositories','branch_protection_rule','release'])
const patrolEvents = new Set(['push', 'branch_protection_rule', 'release'])

function repositoryPatrolConfiguration(): {
  envelope: SignedSecurityEngagement
  trustedKeys: TrustedSecurityEngagementKeys
  killSwitchActive: boolean
} | null | 'invalid' {
  const envelopeJson = process.env.SECURITY_REPOSITORY_PATROL_ENGAGEMENT_JSON
  const trustedKeysJson = process.env.SECURITY_REPOSITORY_PATROL_TRUSTED_KEYS_JSON
  if (!envelopeJson && !trustedKeysJson) return null
  if (!envelopeJson || !trustedKeysJson) return 'invalid'
  try {
    const envelope = JSON.parse(envelopeJson) as SignedSecurityEngagement
    const trustedKeys = JSON.parse(trustedKeysJson) as unknown
    if (!trustedKeys || typeof trustedKeys !== 'object' || Array.isArray(trustedKeys)) return 'invalid'
    const keyEntries = Object.entries(trustedKeys)
    if (keyEntries.length === 0 || keyEntries.some(([keyId, publicKey]) => !keyId || typeof publicKey !== 'string' || !publicKey)) return 'invalid'
    const killSwitch = process.env.SECURITY_PATROL_KILL_SWITCH
    if (killSwitch !== undefined && killSwitch !== 'true' && killSwitch !== 'false') return 'invalid'
    return {
      envelope,
      trustedKeys: Object.freeze(Object.fromEntries(keyEntries)) as TrustedSecurityEngagementKeys,
      killSwitchActive: killSwitch === 'true',
    }
  } catch {
    return 'invalid'
  }
}

export async function POST(req: NextRequest) {
  const body = await req.text()
  if (Buffer.byteLength(body, 'utf8') > MAX_BODY_BYTES) return NextResponse.json({ ok: false, error: { code: 'body_too_large' } }, { status: 413 })
  const secret = process.env.GITHUB_WEBHOOK_SECRET
  if (!secret) return NextResponse.json({ ok: false, error: { code: 'webhook_not_configured' } }, { status: 503 })
  const deliveryId = req.headers.get('x-github-delivery')
  const event = req.headers.get('x-github-event')
  const receivedAt = new Date().toISOString()
  const deliveryHeaders = {
    signature256: req.headers.get('x-hub-signature-256') || '',
    deliveryId: deliveryId || '',
    eventName: event || '',
    userAgent: req.headers.get('user-agent') || '',
    hookId: req.headers.get('x-github-hook-id') || undefined,
    installationTargetType: req.headers.get('x-github-hook-installation-target-type') || undefined,
    installationTargetId: req.headers.get('x-github-hook-installation-target-id') || undefined,
  }
  const deliveryVerification = verifyGitHubWebhookDelivery({ rawBody: body, secret, headers: deliveryHeaders })
  if (deliveryVerification.valid === false) return NextResponse.json({ ok: false, error: { code: deliveryVerification.reason } }, { status: 401 })
  const verified = normalizeAuthenticatedGitHubRepositoryWebhook({
    rawBody: body,
    secret,
    headers: deliveryHeaders,
    receivedAt,
  })
  if (!deliveryId) return NextResponse.json({ ok: false, error: { code: 'missing_delivery' } }, { status: 400 })
  if (!event || !supportedEvents.has(event)) return NextResponse.json({ ok: false, error: { code: 'unsupported_event' } }, { status: 400 })
  if (patrolEvents.has(event) && verified.accepted === false) {
    const status = verified.reason === 'github_signature_invalid' || verified.reason === 'github_user_agent_invalid' ? 401 : 400
    return NextResponse.json({ ok: false, error: { code: verified.reason } }, { status })
  }

  let payload: any
  try { payload = JSON.parse(body) } catch { return NextResponse.json({ ok: false, error: { code: 'malformed_body' } }, { status: 400 }) }
  const repositoryFullName = String(payload?.repository?.full_name || '')
  const organizationId = String(payload?.installation?.account?.id || payload?.organization?.id || process.env.GITHUB_PROVIDER_ORGANIZATION_ID || '')
  if (!repositoryFullName || !organizationId) return NextResponse.json({ ok: false, error: { code: 'provider_identity_not_authorized' } }, { status: 400 })

  const db = getAdminSupabase()
  let securityPatrol: 'not_configured' | 'persisted' | 'duplicate' = 'not_configured'
  const patrolConfiguration = repositoryPatrolConfiguration()
  if (patrolEvents.has(event) && patrolConfiguration === 'invalid') {
    return NextResponse.json({ ok: false, outcome: 'deferred', error: { code: 'security_patrol_configuration_invalid' } }, { status: 503 })
  }
  if (verified.accepted && patrolConfiguration && patrolConfiguration !== 'invalid') {
    const engagementId = patrolConfiguration.envelope.manifest.engagementId
    const minuteStart = new Date(Date.parse(receivedAt) - 60_000).toISOString()
    const [recent, targets, existingTarget] = await Promise.all([
      db.from('security_repository_patrol_evidence').select('id', { count: 'exact', head: true }).eq('engagement_id', engagementId).gte('recorded_at', minuteStart),
      db.from('security_repository_patrol_evidence').select('repository').eq('engagement_id', engagementId),
      db.from('security_repository_patrol_evidence').select('id', { count: 'exact', head: true }).eq('engagement_id', engagementId).eq('repository', repositoryFullName.toLowerCase()),
    ])
    if (recent.error || targets.error || existingTarget.error) {
      return NextResponse.json({ ok: false, outcome: 'deferred', error: { code: 'security_patrol_state_unavailable' } }, { status: 503 })
    }
    const patrol = await ingestDurableRepositoryPatrolEvent({
      envelope: patrolConfiguration.envelope,
      trustedKeys: patrolConfiguration.trustedKeys,
      hostState: {
        now: receivedAt,
        killSwitchActive: patrolConfiguration.killSwitchActive,
        requestsInCurrentMinute: recent.count ?? 0,
        concurrentActions: 0,
        distinctTargetsTouched: new Set((targets.data ?? []).map(row => row.repository)).size,
        targetAlreadyCounted: (existingTarget.count ?? 0) > 0,
      },
      event: verified.event,
      store: createSupabaseRepositoryPatrolStore(db),
    })
    if (!patrol.accepted) {
      return NextResponse.json({ ok: false, outcome: 'deferred', error: { code: patrol.reason } }, { status: 503 })
    }
    securityPatrol = patrol.duplicate ? 'duplicate' : 'persisted'
  }
  const delivery = {
    delivery_id: deliveryId,
    event_type: event,
    organization_id: organizationId,
    repository_full_name: repositoryFullName,
    payload_digest: createHash('sha256').update(body).digest('hex'),
    status: 'accepted_not_processed_yet',
    received_at: receivedAt,
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
    securityPatrol,
  }, { status: 202 })
}
