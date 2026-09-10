import type { SupervisorIncident } from '@/lib/supervisor/incident-schema'
import { isOwnerEmail } from '@/lib/auth/ownerEmails'
import { getAdminSupabase } from '@/utils/supabase/server'
import { enqueueSignalBoostRepositoryRepairJob } from '@/lib/builder/repository-repair-job'
import { signalBoostDeployedRepairTarget } from '@/lib/builder/repository-repair-target'
import { PUBLIC_BRAND } from '@/lib/public-brand'
import {
  isCanonicalOwnedSite,
  OWNED_SITE_OPTIMIZATION_FINDINGS_ERROR,
  OWNED_SITE_OPTIMIZATION_PROBE,
  OWNED_SITE_OPTIMIZATION_PROBE_FAILED_ERROR,
} from './owned-site-optimization-monitoring.ts'
import {
  OWNED_SITE_CYBERSECURITY_FINDINGS_ERROR,
  OWNED_SITE_CYBERSECURITY_PROBE,
  OWNED_SITE_CYBERSECURITY_PROBE_FAILED_ERROR,
} from './owned-site-cybersecurity-monitoring.ts'

const RETRY_SUPPRESSION_MS = 6 * 60 * 60 * 1000
const OPTIMIZER_STARTING_PATHS = Object.freeze([
  'saas/app/api/public/site-optimization/route.ts',
  'saas/next.config.mjs',
  'saas/app/layout.tsx',
  'saas/app/page.tsx',
  'saas/proxy.ts',
  'saas/app/website-optimizer/page.tsx',
  'saas/self-healing-host/owned-site-optimization-monitoring.ts',
  'saas/tests/ownedSiteOptimizationMonitoring.node.test.ts',
])
const CYBERSECURITY_STARTING_PATHS = Object.freeze([
  'saas/app/api/public/cybersecurity-preview/route.ts',
  'saas/next.config.mjs',
  'saas/vercel.json',
  'saas/proxy.ts',
  'saas/app/cybersecurity-check/page.tsx',
  'saas/self-healing-host/owned-site-cybersecurity-monitoring.ts',
  'saas/tests/cybersecurityOwnedSelfHealing.node.test.ts',
])
const DIAGNOSTIC_TRANSPORT_FAILURE = /automated diagnosis was unavailable|diagnostic timed out|invalid json payload|generation_config|response_schema|additionalproperties|cannot find field|cos-primary:|gemini:/i

type RepairDisposition = 'queued' | 'already_active' | 'recently_attempted'
type OwnedRepairKind = 'website-optimizer' | 'cybersecurity-preview'

export type OwnedSiteAutonomousRepairResult = Readonly<{
  disposition: RepairDisposition
  jobId: string
  remediationKey: string
}>

function reportFrom(incident: SupervisorIncident): Record<string, unknown> {
  const value = incident.metadata?.report
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function stringArray(value: unknown): string[] {
  if (typeof value === 'string') {
    return value.split(',').map(item => item.trim()).filter(Boolean).slice(0, 12)
  }
  return Array.isArray(value)
    ? value.map(item => String(item || '').trim()).filter(Boolean).slice(0, 12)
    : []
}

function kindLabel(kind: OwnedRepairKind): string {
  return kind === 'website-optimizer' ? 'Website Optimizer' : 'Cybersecurity Preview'
}

function scopedDiagnosis(value: string, kind: OwnedRepairKind): string {
  const diagnosis = String(value || '').trim()
  if (!diagnosis || DIAGNOSTIC_TRANSPORT_FAILURE.test(diagnosis)) {
    return `Automated diagnosis was unavailable. Use the verified ${kindLabel(kind)} evidence and current repository state; diagnostic-provider transport/schema errors are not owned-site defects.`
  }
  return diagnosis.slice(0, 900)
}

export function isOwnedSiteOptimizationIncident(incident: SupervisorIncident): boolean {
  if (incident.metadata?.nativeProbe !== OWNED_SITE_OPTIMIZATION_PROBE) return false
  if (incident.metadata?.ownedPlatform !== true || incident.metadata?.recoveryPreauthorized !== true) return false
  if (!incident.affectedResource || !isCanonicalOwnedSite(incident.affectedResource)) return false
  return incident.errorCode === OWNED_SITE_OPTIMIZATION_FINDINGS_ERROR
    || incident.errorCode === OWNED_SITE_OPTIMIZATION_PROBE_FAILED_ERROR
}

export function isOwnedSiteCybersecurityIncident(incident: SupervisorIncident): boolean {
  if (incident.metadata?.nativeProbe !== OWNED_SITE_CYBERSECURITY_PROBE) return false
  if (incident.metadata?.ownedPlatform !== true || incident.metadata?.recoveryPreauthorized !== true) return false
  if (!incident.affectedResource || !isCanonicalOwnedSite(incident.affectedResource)) return false
  return incident.errorCode === OWNED_SITE_CYBERSECURITY_FINDINGS_ERROR
    || incident.errorCode === OWNED_SITE_CYBERSECURITY_PROBE_FAILED_ERROR
}

async function resolveOwnerUserId(): Promise<string> {
  const admin = getAdminSupabase()
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 100 })
    if (error) throw new Error(`self_healing_owner_lookup_failed:${error.message}`)
    const users = (Array.isArray(data.users) ? data.users : []) as unknown[]
    for (const entry of users) {
      if (!entry || typeof entry !== 'object') continue
      const user = entry as { id?: unknown; email?: unknown }
      const id = typeof user.id === 'string' ? user.id : ''
      const email = typeof user.email === 'string' ? user.email : null
      if (id && isOwnerEmail(email)) return id
    }
    if (users.length < 100) break
  }
  throw new Error('self_healing_owner_identity_unavailable')
}

function remediationKey(incident: SupervisorIncident, kind: OwnedRepairKind): string {
  const report = reportFrom(incident)
  const codes = stringArray(report.findingCodes).sort().join(',') || incident.errorCode || 'unknown'
  const revision = String(process.env.VERCEL_GIT_COMMIT_SHA || '').trim().toLowerCase() || 'unknown'
  return `${revision}:${kind}:${codes}`.slice(0, 500)
}

function objectiveFor(incident: SupervisorIncident, diagnosis: string, kind: OwnedRepairKind): string {
  const report = reportFrom(incident)
  const codes = stringArray(report.findingCodes)
  const score = Number(report.score)
  const label = kindLabel(kind)
  const reportLine = codes.length
    ? `Current ${label} findings: ${codes.join(', ')}${Number.isFinite(score) ? `; score ${score}` : ''}.`
    : `The owned ${label} probe failed: ${incident.errorMessage}`
  const semantics = kind === 'website-optimizer'
    ? 'Verified finding semantics: missing_csp and missing_nosniff are public HTTP response-header observations; many_scripts is the rendered public HTML script-element workload. Treat these optimizer findings as the repair target, not unrelated model/provider diagnostics.'
    : 'Verified finding semantics: wildcard_cors is the observed public Access-Control-Allow-Origin wildcard; server_header_exposed is a non-empty public Server response header. Do not suppress these detector checks to raise the score. Repair the response/deployment policy when safely possible; if the hosting platform itself injects an immutable Server header, prove that constraint and report it as a verified blocker rather than fabricating a fix.'
  const startingPaths = kind === 'website-optimizer' ? OPTIMIZER_STARTING_PATHS : CYBERSECURITY_STARTING_PATHS
  const verification = kind === 'website-optimizer'
    ? `After the repair, verify the public optimizer can scan ${PUBLIC_BRAND.siteUrl} successfully and that the targeted finding(s) are gone or objectively improved.`
    : `After the repair, verify the public cybersecurity preview can scan ${PUBLIC_BRAND.siteUrl} successfully and that the targeted finding(s) are gone. A platform-managed immutable disclosure may remain only when independently proven and explicitly reported.`
  return [
    `Fix the SignalBoost platform issue detected by the Self-Healing Supervisor on the owned production site ${PUBLIC_BRAND.siteUrl}.`,
    reportLine,
    semantics,
    `Repository starting points (inspect first, not exclusive): ${startingPaths.join(', ')}.`,
    `Supervisor diagnosis: ${scopedDiagnosis(diagnosis, kind)}`,
    `If the diagnostic model/provider failed, ignore its transport/schema error text as repair evidence unless that separate failure is independently reproduced and directly explains the ${label} finding.`,
    'Reproduce the current production behavior before editing. Inspect ONBOARD.md and the current repository first. Repair root causes safely; do not hard-code scores, finding lists, responses, or suppress/relax the scanner to make the check pass.',
    'Prefer the smallest application or deployment-safe change that preserves product behavior. Run the narrowest relevant tests plus the production build gates required by the repository. If a finding is not safely repairable from repository code, make no risky change and report the verified blocker.',
    verification,
  ].join('\n')
}

async function findExistingAttempt(key: string): Promise<{ disposition: Exclude<RepairDisposition, 'queued'>; jobId: string } | null> {
  const admin = getAdminSupabase()
  const { data: active, error: activeError } = await admin
    .from('builder_jobs')
    .select('id,status')
    .in('status', ['queued', 'running', 'paused'])
    .contains('metadata', { selfHealingOwnedSite: true, selfHealingKey: key })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (activeError) throw new Error(`self_healing_builder_dedupe_failed:${activeError.message}`)
  if (active?.id) return { disposition: 'already_active', jobId: String(active.id) }

  const since = new Date(Date.now() - RETRY_SUPPRESSION_MS).toISOString()
  const { data: recent, error: recentError } = await admin
    .from('builder_jobs')
    .select('id,status')
    .eq('status', 'succeeded')
    .gte('created_at', since)
    .contains('metadata', { selfHealingOwnedSite: true, selfHealingKey: key })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (recentError) throw new Error(`self_healing_builder_recent_lookup_failed:${recentError.message}`)
  return recent?.id ? { disposition: 'recently_attempted', jobId: String(recent.id) } : null
}

async function enqueueOwnedSiteRepair(
  incident: SupervisorIncident,
  diagnosis: string,
  kind: OwnedRepairKind,
): Promise<OwnedSiteAutonomousRepairResult> {
  const authorized = kind === 'website-optimizer'
    ? isOwnedSiteOptimizationIncident(incident)
    : isOwnedSiteCybersecurityIncident(incident)
  if (!authorized) throw new Error('owned_site_repair_incident_not_authorized')

  const key = remediationKey(incident, kind)
  const existing = await findExistingAttempt(key)
  if (existing) return Object.freeze({ ...existing, remediationKey: key })

  const objective = objectiveFor(incident, diagnosis, kind)
  const target = signalBoostDeployedRepairTarget(objective, {
    commitSha: process.env.VERCEL_GIT_COMMIT_SHA,
    branch: process.env.VERCEL_GIT_COMMIT_REF || 'main',
  }, { ownerDeveloperLogSubmission: true })
  if (!target) throw new Error('owned_site_repair_deployed_revision_unavailable')

  const userId = await resolveOwnerUserId()
  const job = await enqueueSignalBoostRepositoryRepairJob({
    userId,
    conversationId: crypto.randomUUID(),
    objective,
    target,
  })

  const admin = getAdminSupabase()
  const { data: row, error: readError } = await admin.from('builder_jobs').select('metadata').eq('id', job.jobId).eq('user_id', userId).maybeSingle()
  if (readError || !row) throw new Error(`self_healing_builder_tag_read_failed:${readError?.message || 'job_not_found'}`)
  const metadata = row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata) ? row.metadata : {}
  const { error: tagError } = await admin.from('builder_jobs').update({
    metadata: {
      ...metadata,
      selfHealingOwnedSite: true,
      selfHealingKey: key,
      selfHealingIncidentId: incident.incidentId,
      selfHealingSource: kind,
    },
  }).eq('id', job.jobId).eq('user_id', userId)
  if (tagError) throw new Error(`self_healing_builder_tag_failed:${tagError.message}`)

  return Object.freeze({ disposition: 'queued', jobId: job.jobId, remediationKey: key })
}

export async function enqueueOwnedSiteOptimizationRepair(
  incident: SupervisorIncident,
  diagnosis: string,
): Promise<OwnedSiteAutonomousRepairResult> {
  return enqueueOwnedSiteRepair(incident, diagnosis, 'website-optimizer')
}

export async function enqueueOwnedSiteCybersecurityRepair(
  incident: SupervisorIncident,
  diagnosis: string,
): Promise<OwnedSiteAutonomousRepairResult> {
  return enqueueOwnedSiteRepair(incident, diagnosis, 'cybersecurity-preview')
}
