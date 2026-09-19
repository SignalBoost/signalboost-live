import { createHash } from 'node:crypto'
import type { SupervisorIncident } from '@/lib/supervisor/incident-schema'
import { isOwnerEmail } from '@/lib/auth/ownerEmails'
import { getAdminSupabase } from '@/utils/supabase/server'
import { enqueueSignalBoostRepositoryRepairJob } from '@/lib/builder/repository-repair-job'
import { signalBoostDeployedRepairTarget } from '@/lib/builder/repository-repair-target'
import {
  UNIVERSITY_DISTILLATION_HEALTH_ERROR_CODE,
} from './university-distillation-monitoring.ts'

const RETRY_SUPPRESSION_MS = 15 * 60 * 1000
const MAX_AUTOMATIC_RETRIES = 3
const STARTING_PATHS = Object.freeze([
  'saas/lib/ai/cos/cosUniversityMassDistillation.ts',
  'saas/lib/ai/cos/cosUniversityMassDistillationWorkflow.ts',
  'saas/lib/ai/cos/cosUniversityDistillationCurriculumReplenishment.ts',
  'saas/self-healing-host/university-distillation-monitoring.ts',
  'saas/tests/cosUniversityMassDistillation.node.test.ts',
  'saas/tests/cosUniversityDistillationSelfHealing.node.test.ts',
])

export type UniversityDistillationCodeRepairResult = Readonly<{
  disposition: 'queued' | 'already_active' | 'recently_attempted'
  jobId: string
  remediationKey: string
}>

export type UniversityDistillationCodeRepairRetry = Readonly<{
  retried: boolean
  jobId: string
  sourceJobId: string
  attempt: number
  error: string
}>

function numberMeta(incident: SupervisorIncident, key: string): number {
  const value = Number(incident.metadata?.[key])
  return Number.isFinite(value) ? value : 0
}

function stringMeta(incident: SupervisorIncident, key: string): string {
  return String(incident.metadata?.[key] || '').trim()
}

export function isUniversityDistillationPackagingStallIncident(incident: SupervisorIncident): boolean {
  const reasons = Array.isArray(incident.metadata?.healthReasons)
    ? incident.metadata.healthReasons.map(value => String(value))
    : []
  return incident.errorCode === UNIVERSITY_DISTILLATION_HEALTH_ERROR_CODE
    && incident.metadata?.nativeProbe === 'cos-university-mass-distillation'
    && reasons.includes('curriculum_packaging_stalled')
    && incident.metadata?.curriculumPackagingStalled === true
    && incident.metadata?.recoveryPreauthorized === true
    && incident.metadata?.authorityExpanded === false
    && incident.metadata?.automaticPromotionAuthorized === false
    && incident.metadata?.runpodMutationAuthorized === false
}

async function resolveOwnerUserId(): Promise<string> {
  const admin = getAdminSupabase()
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 100 })
    if (error) throw new Error(`university_self_healing_owner_lookup_failed:${error.message}`)
    const users = Array.isArray(data.users) ? data.users : []
    for (const entry of users as Array<{ id?: unknown; email?: unknown }>) {
      const id = typeof entry?.id === 'string' ? entry.id : ''
      const email = typeof entry?.email === 'string' ? entry.email : null
      if (id && isOwnerEmail(email)) return id
    }
    if (users.length < 100) break
  }
  throw new Error('university_self_healing_owner_identity_unavailable')
}

function remediationKey(incident: SupervisorIncident): string {
  const revision = String(process.env.VERCEL_GIT_COMMIT_SHA || '').trim().toLowerCase() || 'unknown'
  const evidence = [
    stringMeta(incident, 'curriculumProgressSubject'),
    numberMeta(incident, 'curriculumProgressShortfallToBatch'),
    numberMeta(incident, 'curriculumProgressInsertedForSubject'),
    stringMeta(incident, 'curriculumProgressObservedAt'),
  ].join(':')
  return `${revision}:university-packaging:${createHash('sha256').update(evidence).digest('hex').slice(0, 20)}`
}

async function existingAttempt(key: string): Promise<{ disposition: 'already_active' | 'recently_attempted'; jobId: string } | null> {
  const admin = getAdminSupabase()
  const active = await admin.from('builder_jobs')
    .select('id,status')
    .in('status', ['queued', 'running', 'paused'])
    .contains('metadata', { selfHealingUniversityDistillation: true, selfHealingKey: key })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (active.error) throw new Error(`university_self_healing_dedupe_failed:${active.error.message}`)
  if (active.data?.id) return { disposition: 'already_active', jobId: String(active.data.id) }

  const since = new Date(Date.now() - RETRY_SUPPRESSION_MS).toISOString()
  const recent = await admin.from('builder_jobs')
    .select('id,status')
    .in('status', ['succeeded', 'failed'])
    .gte('created_at', since)
    .contains('metadata', { selfHealingUniversityDistillation: true, selfHealingKey: key })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (recent.error) throw new Error(`university_self_healing_recent_lookup_failed:${recent.error.message}`)
  return recent.data?.id ? { disposition: 'recently_attempted', jobId: String(recent.data.id) } : null
}

function objectiveFor(incident: SupervisorIncident, diagnosis: string): string {
  const subject = stringMeta(incident, 'curriculumProgressSubject') || 'unknown subject'
  const shortfall = numberMeta(incident, 'curriculumProgressShortfallToBatch')
  const inserted = numberMeta(incident, 'curriculumProgressInsertedForSubject')
  const before = numberMeta(incident, 'curriculumProgressPreparedBefore')
  const after = numberMeta(incident, 'curriculumProgressPreparedAfter')
  const observedAt = stringMeta(incident, 'curriculumProgressObservedAt') || incident.detectedAt
  return [
    'Repair the COS University distillation packaging defect detected by the Self-Healing Supervisor in Production.',
    `Verified progress invariant: subject "${subject}" had a recorded batch shortfall of ${shortfall}; the same maintenance cycle inserted ${inserted} governed same-subject curriculum item(s), yet prepared inventory stayed ${before} -> ${after}. Evidence time: ${observedAt}.`,
    `Supervisor diagnosis: ${String(diagnosis || '').slice(0, 900)}`,
    `Repository starting points (inspect first, not exclusive): ${STARTING_PATHS.join(', ')}.`,
    'Read ONBOARD.md and scan the current repository before editing. Reproduce the progress contradiction against current code/evidence before changing source.',
    'Repair the root cause with the smallest safe repository change. Do not lower the 20-item batch minimum, weaken rights/provenance/confidence/deduplication/semantic-cohesion checks, manufacture curriculum, hard-code a passing result, suppress the monitor, or expand provider/spend/promotion/Production authority.',
    'Preserve Dynamic Pipeline Router provider neutrality. A provider failure may reroute only within existing authority.',
    'Run the narrowest directly relevant University/Self-Healing tests and a targeted typecheck/build proof as appropriate. The normal repair PR pipeline owns the complete CI gates.',
    'Success requires a real prepared batch or other objectively valid downstream progress from governed curriculum, followed by independent Production re-observation. If current Production already proves the defect superseded, make no unnecessary code change.',
  ].join('\n')
}

export async function enqueueUniversityDistillationPackagingRepair(
  incident: SupervisorIncident,
  diagnosis: string,
): Promise<UniversityDistillationCodeRepairResult> {
  if (!isUniversityDistillationPackagingStallIncident(incident)) {
    throw new Error('university_distillation_code_repair_incident_not_authorized')
  }
  const key = remediationKey(incident)
  const existing = await existingAttempt(key)
  if (existing) return Object.freeze({ ...existing, remediationKey: key })

  const objective = objectiveFor(incident, diagnosis)
  const target = signalBoostDeployedRepairTarget(objective, {
    commitSha: process.env.VERCEL_GIT_COMMIT_SHA,
    branch: process.env.VERCEL_GIT_COMMIT_REF || 'main',
  }, { ownerDeveloperLogSubmission: true })
  if (!target) throw new Error('university_distillation_code_repair_deployed_revision_unavailable')

  const userId = await resolveOwnerUserId()
  const job = await enqueueSignalBoostRepositoryRepairJob({
    userId,
    conversationId: crypto.randomUUID(),
    objective,
    target,
  })

  const admin = getAdminSupabase()
  const row = await admin.from('builder_jobs').select('metadata').eq('id', job.jobId).eq('user_id', userId).maybeSingle()
  if (row.error || !row.data) throw new Error(`university_self_healing_tag_read_failed:${row.error?.message || 'job_not_found'}`)
  const metadata = row.data.metadata && typeof row.data.metadata === 'object' && !Array.isArray(row.data.metadata) ? row.data.metadata : {}
  const tagged = await admin.from('builder_jobs').update({
    metadata: {
      ...metadata,
      selfHealingUniversityDistillation: true,
      selfHealingKey: key,
      selfHealingIncidentId: incident.incidentId,
      selfHealingSource: 'university-distillation-packaging',
      universityRepairRetryAttempt: 0,
    },
  }).eq('id', job.jobId).eq('user_id', userId)
  if (tagged.error) throw new Error(`university_self_healing_tag_failed:${tagged.error.message}`)

  return Object.freeze({ disposition: 'queued', jobId: job.jobId, remediationKey: key })
}

export async function retryFailedUniversityDistillationRepair(admin: any): Promise<UniversityDistillationCodeRepairRetry> {
  const failed = await admin.from('builder_jobs')
    .select('id,user_id,objective,metadata,error,updated_at')
    .eq('status', 'failed')
    .eq('job_kind', 'standard')
    .eq('owner_authorized', true)
    .contains('metadata', { selfHealingUniversityDistillation: true })
    .lt('updated_at', new Date(Date.now() - 60_000).toISOString())
    .order('updated_at', { ascending: true })
    .limit(10)
  if (failed.error) return { retried: false, jobId: '', sourceJobId: '', attempt: 0, error: `university_self_healing_retry_read_failed:${failed.error.message}` }

  const row = (failed.data || []).find((candidate: any) => {
    const metadata = candidate?.metadata && typeof candidate.metadata === 'object' && !Array.isArray(candidate.metadata) ? candidate.metadata : {}
    return Number(metadata.universityRepairRetryAttempt || 0) < MAX_AUTOMATIC_RETRIES && !metadata.universityRepairRetryClaimedAt
  })
  if (!row) return { retried: false, jobId: '', sourceJobId: '', attempt: 0, error: '' }

  const metadata = row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata) ? row.metadata : {}
  const attempt = Number(metadata.universityRepairRetryAttempt || 0) + 1
  const claimed = await admin.from('builder_jobs').update({
    metadata: { ...metadata, universityRepairRetryClaimedAt: new Date().toISOString() },
  }).eq('id', row.id).eq('status', 'failed').select('id').maybeSingle()
  if (claimed.error || !claimed.data) {
    return { retried: false, jobId: '', sourceJobId: String(row.id || ''), attempt, error: claimed.error?.message || '' }
  }

  try {
    const objective = `${String(row.objective || '')}\n\nAutomatic Self-Healing retry ${attempt}/${MAX_AUTOMATIC_RETRIES}. Prior Platform Engineer execution ended with ${String(row.error || 'an execution failure')}. Reproduce narrowly against current repository truth before any edit; do not repeat already completed inspection.`
    const target = signalBoostDeployedRepairTarget(objective, {
      commitSha: process.env.VERCEL_GIT_COMMIT_SHA,
      branch: process.env.VERCEL_GIT_COMMIT_REF || 'main',
    }, { ownerDeveloperLogSubmission: true })
    if (!target) throw new Error('university_distillation_code_repair_deployed_revision_unavailable')
    const job = await enqueueSignalBoostRepositoryRepairJob({
      userId: String(row.user_id),
      conversationId: crypto.randomUUID(),
      objective,
      target,
    })
    const created = await admin.from('builder_jobs').select('metadata').eq('id', job.jobId).eq('user_id', row.user_id).maybeSingle()
    if (created.error || !created.data) throw new Error(`university_self_healing_retry_tag_read_failed:${created.error?.message || 'job_not_found'}`)
    const createdMetadata = created.data.metadata && typeof created.data.metadata === 'object' && !Array.isArray(created.data.metadata) ? created.data.metadata : {}
    const tagged = await admin.from('builder_jobs').update({
      metadata: {
        ...createdMetadata,
        selfHealingUniversityDistillation: true,
        selfHealingKey: String(metadata.selfHealingKey || ''),
        selfHealingIncidentId: String(metadata.selfHealingIncidentId || ''),
        selfHealingSource: 'university-distillation-packaging-retry',
        universityRepairRetryAttempt: attempt,
        universityRepairRetrySourceJobId: String(row.id),
      },
    }).eq('id', job.jobId).eq('user_id', row.user_id)
    if (tagged.error) throw new Error(`university_self_healing_retry_tag_failed:${tagged.error.message}`)
    return { retried: true, jobId: job.jobId, sourceJobId: String(row.id), attempt, error: '' }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'university_self_healing_retry_failed'
    await admin.from('builder_jobs').update({
      metadata: { ...metadata, universityRepairRetryAttempt: attempt, universityRepairRetryError: message },
    }).eq('id', row.id)
    return { retried: false, jobId: '', sourceJobId: String(row.id), attempt, error: message }
  }
}
