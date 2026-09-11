import { NextRequest, NextResponse } from 'next/server'
import { getAdminSupabase } from '@/utils/supabase/server'
import { createSupervisorCoordinationStore } from '@/lib/supervisor/coordination'
import { ownershipIdentity } from '@/lib/supervisor/coordination'
import { enqueueGitHubObservation, loadActiveGitHubConnections, runAcceptedGitHubObservation } from '@/lib/provider-framework/github-production'
import type { GitHubCapability } from '@/lib/provider-framework/github'
import { materializeGuardianRepositoryObservation } from '@/lib/security/github-guardian-observation'
import { createGuardianSelfHealingHandoff, guardianReviewRequest } from '@/lib/security/github-guardian-self-healing'
import { remediateNativeIncidents } from '@/self-healing-host/native-autonomous-loop'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const bounded = (name: string, fallback: number, max: number) => Math.min(Math.max(Number(process.env[name] || fallback), 1), max)
const capability = (): GitHubCapability => {
  const configured = process.env.GITHUB_OBSERVATION_CAPABILITY || 'github.repository.read'
  const allowed = new Set<GitHubCapability>(['github.repository.read','github.workflow_runs.read','github.failed_workflow_runs.read','github.pull_requests.read','github.pull_request_status.read','github.branch_protection.read','github.security_alerts.summary','github.rate_limit.read'])
  return allowed.has(configured as GitHubCapability) ? configured as GitHubCapability : 'github.repository.read'
}

async function processWebhookBacklog(input: {
  db: any
  coordinationStore: ReturnType<typeof createSupervisorCoordinationStore>
  instanceId: string
  runtimeId: string
  leaseMs: number
  limit: number
}) {
  const summary: Array<Record<string, unknown>> = []
  const available = await input.coordinationStore.listAvailableWork({ provider: 'github', limit: input.limit, now: new Date() })
  const work = available.filter(item => item.workItemType === 'github_observation' && item.workItemId.startsWith('github-webhook:'))
  if (!work.length) return summary
  const now = new Date().toISOString()
  await input.coordinationStore.registerInstance({
    instanceId: input.instanceId,
    runtimeId: input.runtimeId,
    startedAt: now,
    heartbeatAt: now,
    softwareVersion: process.env.VERCEL_GIT_COMMIT_SHA || 'local',
    schemaVersion: 'supervisor-instance-v1',
    supportedProviderKinds: ['github'],
    status: 'healthy',
  })
  for (const item of work) {
    const deliveryId = item.workItemId.split(':').at(-1) || ''
    let lease: Awaited<ReturnType<typeof input.coordinationStore.acquireLease>> | undefined
    try {
      const evidence = await input.db.from('security_repository_patrol_evidence')
        .select('evidence_entry').eq('delivery_id', deliveryId).maybeSingle()
      lease = await input.coordinationStore.acquireLease({
        workItemId: item.workItemId,
        ownerInstanceId: input.instanceId,
        ownerRuntimeId: input.runtimeId,
        leaseDurationMs: input.leaseMs,
      })
      const owner = ownershipIdentity(lease)
      await input.coordinationStore.transitionWorkItem({ workItemId: item.workItemId, from: 'leased', to: 'processing', owner })
      if (evidence.error) throw new Error('patrol_evidence_lookup_failed')
      if (!evidence.data?.evidence_entry) {
        const deliveryUpdated = await input.db.from('github_webhook_deliveries')
          .update({ status: 'completed' }).eq('delivery_id', deliveryId)
        if (deliveryUpdated.error) throw new Error('guardian_delivery_completion_failed')
        await input.coordinationStore.transitionWorkItem({ workItemId: item.workItemId, from: 'processing', to: 'completed', owner })
        summary.push({ workItemId: item.workItemId, outcome: 'completed', reason: 'no_patrol_observation_required' })
        continue
      }
      const materialized = materializeGuardianRepositoryObservation({
        organizationId: item.organizationId || '',
        workItemId: item.workItemId,
        deliveryId,
        evidenceEntry: evidence.data.evidence_entry,
      })
      const observed = await input.db.from('github_normalized_observations').upsert(materialized.observation, {
        onConflict: 'organization_id,provider_id,resource_type,resource_id,observation_type,correlation_id',
      })
      if (observed.error) throw new Error('guardian_observation_persist_failed')
      let alertCreated = false
      let alertId: string | null = null
      const selfHealing = createGuardianSelfHealingHandoff({
        deliveryId,
        workItemId: item.workItemId,
        organizationId: item.organizationId || '',
        observation: materialized.observation,
        alert: materialized.alert,
      })
      if (selfHealing) {
        if (!materialized.alert) throw new Error('guardian_review_alert_missing')
        const [supervisorResult] = await remediateNativeIncidents([selfHealing.incident], {
          maxIncidents: 1,
          automaticRepairAllowed: false,
        })
        if (!supervisorResult) throw new Error('guardian_supervisor_diagnosis_missing')
        let reviewRequestId: string | null = null
        if (selfHealing.policy.outcome === 'approval_required' || selfHealing.policy.outcome === 'blocked') {
          const reviewPayload = guardianReviewRequest({ alertId: deliveryId, handoff: selfHealing })
          const finding = Array.isArray(reviewPayload.findings) ? reviewPayload.findings[0] : null
          const groupKey = `guardian-repository-change:${String(materialized.observation.resource_id || '').toLowerCase()}`
          const review = await input.db.rpc('record_guardian_repository_review_observation', {
            p_alert_id: deliveryId,
            p_group_key: groupKey,
            p_alert: materialized.alert,
            p_review: reviewPayload,
            p_finding: finding,
          })
          if (review.error) throw new Error('guardian_review_persist_failed')
          const disposition = review.data && typeof review.data === 'object' ? review.data as Record<string, unknown> : {}
          alertId = String(disposition.alertId || deliveryId)
          alertCreated = disposition.alertCreated === true
          reviewRequestId = String(disposition.reviewRequestId || alertId)
          const reviewUpdate = await input.db.from('remediation_requests').update({
            summary: supervisorResult.diagnosis,
            implementation_status: supervisorResult.outcome === 'staged' ? 'supervisor_review_staged' : supervisorResult.outcome,
            implementation_notes: supervisorResult.message,
            updated_at: new Date().toISOString(),
          }).eq('id', reviewRequestId)
          if (reviewUpdate.error) throw new Error('guardian_supervisor_result_persist_failed')
        }
        const events = [
          {
            event_id: `guardian-self-healing-${deliveryId}-received`,
            incident_id: selfHealing.incident.incidentId,
            event_type: 'incident_received',
            occurred_at: new Date().toISOString(),
            payload: {
              provider: 'github',
              environment: 'production',
              evidenceReference: materialized.observation.correlation_id,
            },
            schema_version: 'supervisor-audit-v1',
          },
          {
            event_id: `guardian-self-healing-${deliveryId}-policy`,
            incident_id: selfHealing.incident.incidentId,
            event_type: 'policy_evaluated',
            occurred_at: new Date().toISOString(),
            payload: {
              planId: selfHealing.plan.planId,
              outcome: selfHealing.policy.outcome,
              reason: selfHealing.policy.reason,
              automaticRepairAuthorized: false,
              providerMutations: false,
              reviewRequestId,
              disposition: reviewRequestId ? 'human_review' : 'expected_activity',
              supervisorOutcome: supervisorResult.outcome,
              diagnosisConfidence: supervisorResult.diagnosisConfidence,
              repairSteps: supervisorResult.repairSteps,
              supervisorMessage: supervisorResult.message,
            },
            schema_version: 'supervisor-audit-v1',
          },
        ]
        const handedOff = await input.db.from('supervisor_audit_events').upsert(events, { onConflict: 'event_id', ignoreDuplicates: true })
        if (handedOff.error) throw new Error('guardian_self_healing_handoff_failed')
      }
      const audited = await input.db.from('supervisor_audit_events').insert({
        event_id: `guardian-github-${deliveryId}`,
        incident_id: item.incidentId,
        event_type: 'guardian_repository_observation_completed',
        occurred_at: new Date().toISOString(),
        payload: { deliveryId, correlationId: materialized.observation.correlation_id, alertCreated },
        schema_version: 'supervisor-audit-event-v1',
      })
      if (audited.error && !String(audited.error.code || '').includes('23505')) throw new Error('guardian_audit_persist_failed')
      const deliveryUpdated = await input.db.from('github_webhook_deliveries')
        .update({ status: 'completed' }).eq('delivery_id', deliveryId)
      if (deliveryUpdated.error) throw new Error('guardian_delivery_completion_failed')
      await input.coordinationStore.transitionWorkItem({ workItemId: item.workItemId, from: 'processing', to: 'completed', owner })
      summary.push({ workItemId: item.workItemId, outcome: 'completed', alertCreated, selfHealing: selfHealing?.policy.outcome || 'not_required' })
    } catch (error: any) {
      if (lease) {
        try { await input.coordinationStore.releaseLease(ownershipIdentity(lease)) } catch { /* lease expiry will recover ownership */ }
      }
      summary.push({ workItemId: item.workItemId, outcome: 'deferred', reason: String(error?.message || 'processing_failed').split(':')[0] })
    }
  }
  return summary
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: { code: 'unauthorized_cron' } }, { status: 401 })
  }
  const db = getAdminSupabase()
  let coordinationStore
  try { coordinationStore = createSupervisorCoordinationStore({ supabase: db, runtime: process.env.NODE_ENV as any }) }
  catch { return NextResponse.json({ ok: false, outcome: 'deferred', error: { code: 'coordination_unavailable' } }, { status: 503 }) }

  const started = Date.now()
  const maxConnections = bounded('GITHUB_OBSERVATION_MAX_CONNECTIONS', 3, 25)
  const maxDurationMs = bounded('GITHUB_OBSERVATION_MAX_DURATION_MS', 45000, 55000)
  const leaseMs = bounded('SUPERVISOR_LEASE_MS', 60000, 300000)
  const selectedCapability = capability()
  const summary: Array<Record<string, unknown>> = []
  const instanceId = process.env.SUPERVISOR_INSTANCE_ID || 'github-observation-cron'
  const runtimeId = process.env.SUPERVISOR_RUNTIME_ID || `runtime-${process.pid}`

  try { await coordinationStore.reconcileExpiredLeases(new Date()) }
  catch { summary.push({ phase: 'reconciliation', outcome: 'deferred', reason: 'coordination_unavailable' }) }

  try {
    summary.push(...await processWebhookBacklog({
      db,
      coordinationStore,
      instanceId,
      runtimeId,
      leaseMs,
      limit: bounded('GITHUB_WEBHOOK_WORK_MAX_ITEMS', 10, 25),
    }))
  } catch {
    summary.push({ phase: 'webhook_backlog', outcome: 'deferred', reason: 'coordination_unavailable' })
  }

  let connections
  try { connections = await loadActiveGitHubConnections(db, maxConnections) }
  catch { connections = []; summary.push({ phase: 'scheduled_connections', outcome: 'deferred', reason: 'connection_lookup_unavailable' }) }
  const windowStart = new Date(Math.floor(Date.now() / 300000) * 300000).toISOString()
  for (const connection of connections) {
    if (Date.now() - started > maxDurationMs) { summary.push({ outcome: 'deferred', reason: 'max_duration' }); break }
    try {
      const accepted = await enqueueGitHubObservation({ coordinationStore, connection, capability: selectedCapability, windowStart })
      let observationCount = 0
      if (accepted.outcome === 'created' && accepted.workItem) {
        const observations = await runAcceptedGitHubObservation({
          db, coordinationStore, connection, workItem: accepted.workItem, capability: selectedCapability,
          ownerInstanceId: instanceId,
          ownerRuntimeId: runtimeId,
          leaseMs,
        })
        observationCount = observations.length
      }
      summary.push({ repository: `${connection.owner}/${connection.repository}`, capability: selectedCapability, outcome: accepted.outcome, workItemId: accepted.workItem?.workItemId, observationCount })
    } catch (error: any) {
      summary.push({ repository: `${connection.owner}/${connection.repository}`, capability: selectedCapability, outcome: 'rejected', reason: String(error?.message || 'failed').split(':')[0] })
    }
  }

  return NextResponse.json({
    ok: true,
    schemaVersion: 'github-observation-cron-v1',
    readOnly: true,
    repairAttempted: false,
    providerMutations: false,
    productionBrowserExecution: false,
    summary,
  })
}
