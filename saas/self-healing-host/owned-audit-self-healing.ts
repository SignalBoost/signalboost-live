import { createHash } from 'node:crypto'
import { enqueueSignalBoostRepositoryRepairJob } from '@/lib/builder/repository-repair-job'
import { signalBoostDeployedRepairTarget } from '@/lib/builder/repository-repair-target'
import { parseRepoUrl } from '@/lib/audit/repoTarget'
import { runApprovedAuditRemediationWithRetry } from '@/lib/audit/approvedRunRemediationRetry'

const REPO = 'SignalBoost/signalboost-live'
const BASE_BRANCH = 'main'
const RETRY_SUPPRESSION_MS = 6 * 60 * 60 * 1000
const MAX_AUTOMATIC_ENGINE_RETRIES = 3
const AUDIT_ENGINE_STARTING_PATHS = Object.freeze([
  'saas/lib/audit/runner.ts',
  'saas/lib/audit/modelRouter.ts',
  'saas/lib/audit/modelResponse.ts',
  'saas/app/api/hub/operator/audit/route.ts',
  'saas/app/dashboard/audit/page.tsx',
])

export type OwnedAuditAuthorization = Readonly<{
  authorized: boolean
  alreadyAuthorized: boolean
  error: string
}>

export type OwnedAuditEngineRepair = Readonly<{
  disposition: 'queued' | 'already_active' | 'recently_attempted' | 'not_owned' | 'unavailable'
  jobId: string
  remediationKey: string
  error: string
}>

export type OwnedAuditEngineRetry = Readonly<{
  retried: boolean
  jobId: string
  sourceJobId: string
  attempt: number
  error: string
}>

export function isCanonicalOwnedAuditTarget(value: string): boolean {
  const parsed = parseRepoUrl(String(value || '').trim())
  if (!parsed || parsed.repo.toLowerCase() !== REPO.toLowerCase()) return false
  return !parsed.branch || parsed.branch === BASE_BRANCH
}

function approvalEvent(data: any) {
  return Array.isArray(data) ? data[0] : data
}

export async function authorizeOwnedAuditFindings(params: {
  admin: any
  runId: string
  actorUserId: string
  prefix: string
}): Promise<OwnedAuditAuthorization> {
  if (!isCanonicalOwnedAuditTarget(params.prefix)) {
    return { authorized: false, alreadyAuthorized: false, error: 'Automatic remediation is restricted to the canonical owned repository.' }
  }

  const approval = await params.admin.rpc('approve_audit_run_remediation_v2', {
    p_run_id: params.runId,
    p_approved_by: params.actorUserId,
  })
  if (approval.error) {
    const error = String(approval.error.message || 'Owned audit authorization failed.')
    await params.admin.from('audit_logs').insert({
      run_id: params.runId,
      user_id: params.actorUserId,
      payload: {
        kind: 'audit_self_healing_authorization',
        ok: false,
        source: 'self-healing-supervisor',
        error,
        at: new Date().toISOString(),
      },
    })
    return { authorized: false, alreadyAuthorized: false, error }
  }

  const event = approvalEvent(approval.data)
  const alreadyAuthorized = event?.reason === 'already_approved'
  const authorized = Boolean(event?.approved || alreadyAuthorized)
  const error = authorized ? '' : String(event?.message || event?.reason || 'Owned audit authorization was refused.')

  await params.admin.from('audit_logs').insert({
    run_id: params.runId,
    user_id: params.actorUserId,
    payload: {
      kind: 'audit_self_healing_authorization',
      ok: authorized,
      source: 'self-healing-supervisor',
      authorization: 'standing-owner-policy',
      alreadyAuthorized,
      error,
      at: new Date().toISOString(),
    },
  })
  return { authorized, alreadyAuthorized, error }
}

export async function runAuthorizedOwnedAuditFindingsRemediation(params: {
  admin: any
  runId: string
  actorUserId: string
}) {
  try {
    const remediation = await runApprovedAuditRemediationWithRetry(params)
    await params.admin.from('audit_logs').insert({
      run_id: params.runId,
      user_id: params.actorUserId,
      payload: {
        kind: 'audit_self_healing_dispatch',
        source: 'self-healing-supervisor',
        ok: Boolean(remediation.ok),
        lifecycleStatus: remediation.lifecycleStatus || remediation.status,
        prNumber: remediation.prNumber || 0,
        prUrl: remediation.prUrl || '',
        mergeCommitSha: remediation.mergeCommitSha || '',
        findingsTotal: remediation.findingsTotal || 0,
        findingsApplied: remediation.findingsApplied || 0,
        findingsAlreadyResolved: remediation.findingsAlreadyResolved || 0,
        at: new Date().toISOString(),
      },
    })
    return remediation
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Owned audit remediation worker failed.'
    await params.admin.from('audit_logs').insert({
      run_id: params.runId,
      user_id: params.actorUserId,
      payload: {
        kind: 'audit_self_healing_dispatch',
        source: 'self-healing-supervisor',
        ok: false,
        lifecycleStatus: 'failed',
        error: message,
        at: new Date().toISOString(),
      },
    })
    throw error
  }
}

function engineRemediationKey(error: string): string {
  const revision = String(process.env.VERCEL_GIT_COMMIT_SHA || '').trim().toLowerCase() || 'unknown'
  const digest = createHash('sha256').update(String(error || '').trim().toLowerCase()).digest('hex').slice(0, 20)
  return `${revision}:audit-engine:${digest}`
}

async function existingEngineAttempt(admin: any, key: string): Promise<{ disposition: 'already_active' | 'recently_attempted'; jobId: string } | null> {
  const active = await admin
    .from('builder_jobs')
    .select('id,status')
    .in('status', ['queued', 'running', 'paused'])
    .contains('metadata', { selfHealingOwnedAudit: true, selfHealingKey: key })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (active.error) throw new Error(`audit_self_healing_dedupe_failed:${active.error.message}`)
  if (active.data?.id) return { disposition: 'already_active', jobId: String(active.data.id) }

  const since = new Date(Date.now() - RETRY_SUPPRESSION_MS).toISOString()
  const recent = await admin
    .from('builder_jobs')
    .select('id,status')
    .eq('status', 'succeeded')
    .gte('created_at', since)
    .contains('metadata', { selfHealingOwnedAudit: true, selfHealingKey: key })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (recent.error) throw new Error(`audit_self_healing_recent_lookup_failed:${recent.error.message}`)
  return recent.data?.id ? { disposition: 'recently_attempted', jobId: String(recent.data.id) } : null
}

export async function enqueueOwnedAuditEngineRepair(params: {
  admin: any
  runId: string
  actorUserId: string
  prefix: string
  error: string
}): Promise<OwnedAuditEngineRepair> {
  if (!isCanonicalOwnedAuditTarget(params.prefix)) {
    return { disposition: 'not_owned', jobId: '', remediationKey: '', error: '' }
  }

  const key = engineRemediationKey(params.error)
  try {
    const existing = await existingEngineAttempt(params.admin, key)
    if (existing) return { ...existing, remediationKey: key, error: '' }

    const objective = [
      'Repair the iTMounts Audit Console failure detected by the Self-Healing Supervisor in Production.',
      `Audit run: ${params.runId}.`,
      `Production failure: ${String(params.error || 'unknown audit failure').slice(0, 1200)}.`,
      `Repository starting points (inspect first, not exclusive): ${AUDIT_ENGINE_STARTING_PATHS.join(', ')}.`,
      'Reproduce the Audit failure before editing. Read ONBOARD.md and scan the current repository first.',
      'Repair the root cause; do not suppress Audit errors, weaken parsing/validation, skip files, hard-code a passing result, or hide findings.',
      'For model-format failures, align the model prompt, transport-enforced structured output, and parser contract so valid output is deterministic while malformed output still fails closed.',
      'Run the relevant Audit regressions and the repository Production gates. Verify that the canonical repository Audit proceeds past the previously failing file before claiming success.',
    ].join('\n')

    const target = signalBoostDeployedRepairTarget(objective, {
      commitSha: process.env.VERCEL_GIT_COMMIT_SHA,
      branch: process.env.VERCEL_GIT_COMMIT_REF || BASE_BRANCH,
    }, { ownerDeveloperLogSubmission: true })
    if (!target) {
      return { disposition: 'unavailable', jobId: '', remediationKey: key, error: 'audit_self_healing_deployed_revision_unavailable' }
    }

    const job = await enqueueSignalBoostRepositoryRepairJob({
      userId: params.actorUserId,
      conversationId: crypto.randomUUID(),
      objective,
      target,
    })

    const row = await params.admin.from('builder_jobs').select('metadata').eq('id', job.jobId).eq('user_id', params.actorUserId).maybeSingle()
    if (row.error || !row.data) throw new Error(`audit_self_healing_tag_read_failed:${row.error?.message || 'job_not_found'}`)
    const metadata = row.data.metadata && typeof row.data.metadata === 'object' && !Array.isArray(row.data.metadata) ? row.data.metadata : {}
    const tagged = await params.admin.from('builder_jobs').update({
      metadata: {
        ...metadata,
        selfHealingOwnedAudit: true,
        selfHealingKey: key,
        selfHealingSource: 'audit-console-engine',
        auditRunId: params.runId,
      },
    }).eq('id', job.jobId).eq('user_id', params.actorUserId)
    if (tagged.error) throw new Error(`audit_self_healing_tag_failed:${tagged.error.message}`)

    await params.admin.from('audit_logs').insert({
      run_id: params.runId,
      user_id: params.actorUserId,
      payload: {
        kind: 'audit_self_healing_engine_repair',
        source: 'self-healing-supervisor',
        ok: true,
        status: 'queued',
        jobId: job.jobId,
        remediationKey: key,
        at: new Date().toISOString(),
      },
    })
    return { disposition: 'queued', jobId: job.jobId, remediationKey: key, error: '' }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'audit_self_healing_engine_repair_failed'
    await params.admin.from('audit_logs').insert({
      run_id: params.runId,
      user_id: params.actorUserId,
      payload: {
        kind: 'audit_self_healing_engine_repair',
        source: 'self-healing-supervisor',
        ok: false,
        status: 'failed',
        remediationKey: key,
        error: message,
        at: new Date().toISOString(),
      },
    })
    return { disposition: 'unavailable', jobId: '', remediationKey: key, error: message }
  }
}

export async function retryFailedOwnedAuditEngineRepair(admin: any): Promise<OwnedAuditEngineRetry> {
  const failed = await admin.from('builder_jobs')
    .select('id,user_id,objective,metadata,error,updated_at')
    .eq('status', 'failed')
    .eq('job_kind', 'standard')
    .eq('owner_authorized', true)
    .contains('metadata', { selfHealingOwnedAudit: true })
    .lt('updated_at', new Date(Date.now() - 60_000).toISOString())
    .order('updated_at', { ascending: true })
    .limit(10)
  if (failed.error) return { retried: false, jobId: '', sourceJobId: '', attempt: 0, error: `audit_self_healing_retry_read_failed:${failed.error.message}` }

  const row = (failed.data || []).find((candidate: any) => {
    const metadata = candidate?.metadata && typeof candidate.metadata === 'object' && !Array.isArray(candidate.metadata) ? candidate.metadata : {}
    const attempt = Number(metadata.auditEngineRetryAttempt || 0)
    return attempt < MAX_AUTOMATIC_ENGINE_RETRIES && !metadata.auditEngineRetryClaimedAt
  })
  if (!row) return { retried: false, jobId: '', sourceJobId: '', attempt: 0, error: '' }

  const metadata = row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata) ? row.metadata : {}
  const attempt = Number(metadata.auditEngineRetryAttempt || 0) + 1
  const claimedMetadata = { ...metadata, auditEngineRetryClaimedAt: new Date().toISOString() }
  const claimed = await admin.from('builder_jobs').update({ metadata: claimedMetadata })
    .eq('id', row.id).eq('status', 'failed').eq('metadata', JSON.stringify(metadata)).select('id').maybeSingle()
  if (claimed.error || !claimed.data) return { retried: false, jobId: '', sourceJobId: String(row.id || ''), attempt, error: claimed.error?.message || '' }

  try {
    const objective = `${String(row.objective || '')}\n\nAutomatic Self-Healing retry ${attempt}/${MAX_AUTOMATIC_ENGINE_RETRIES}. The prior worker ended with ${String(row.error || 'an execution failure')}. Reproduce narrowly, then continue from current repository truth without repeating inspection.`
    const target = signalBoostDeployedRepairTarget(objective, {
      commitSha: process.env.VERCEL_GIT_COMMIT_SHA,
      branch: process.env.VERCEL_GIT_COMMIT_REF || BASE_BRANCH,
    }, { ownerDeveloperLogSubmission: true })
    if (!target) throw new Error('audit_self_healing_deployed_revision_unavailable')
    const job = await enqueueSignalBoostRepositoryRepairJob({ userId: String(row.user_id), conversationId: crypto.randomUUID(), objective, target })
    const created = await admin.from('builder_jobs').select('metadata').eq('id', job.jobId).eq('user_id', row.user_id).maybeSingle()
    if (created.error || !created.data) throw new Error(`audit_self_healing_retry_tag_read_failed:${created.error?.message || 'job_not_found'}`)
    const createdMetadata = created.data.metadata && typeof created.data.metadata === 'object' && !Array.isArray(created.data.metadata) ? created.data.metadata : {}
    const tagged = await admin.from('builder_jobs').update({ metadata: {
      ...createdMetadata,
      selfHealingOwnedAudit: true,
      selfHealingKey: String(metadata.selfHealingKey || ''),
      selfHealingSource: 'audit-console-engine-retry',
      auditRunId: String(metadata.auditRunId || ''),
      auditEngineRetryAttempt: attempt,
      auditEngineRetrySourceJobId: String(row.id),
    } }).eq('id', job.jobId).eq('user_id', row.user_id)
    if (tagged.error) throw new Error(`audit_self_healing_retry_tag_failed:${tagged.error.message}`)
    return { retried: true, jobId: job.jobId, sourceJobId: String(row.id), attempt, error: '' }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'audit_self_healing_retry_failed'
    await admin.from('builder_jobs').update({ metadata: { ...metadata, auditEngineRetryAttempt: attempt, auditEngineRetryError: message } }).eq('id', row.id)
    return { retried: false, jobId: '', sourceJobId: String(row.id), attempt, error: message }
  }
}
