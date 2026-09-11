import { enqueueSignalBoostRepositoryRepairJob } from '@/lib/builder/repository-repair-job'
import { signalBoostDeployedRepairTarget } from '@/lib/builder/repository-repair-target'
import { parseRepoUrl } from '@/lib/audit/repoTarget'
import type { ApprovedRunSystemResult } from '@/lib/audit/approvedRunRemediationSystem'

const REPO = 'SignalBoost/signalboost-live'
const BASE_BRANCH = 'main'
const FAILED_RETRY_SUPPRESSION_MS = 15 * 60 * 1000
const COMPLETED_RECHECK_WINDOW_MS = 6 * 60 * 60 * 1000

// These categories have deterministic source-local reproduction rules. Model-written
// security/logic findings may depend on imports, cookie policy, database policy,
// deployment configuration, or other files and therefore need repository-aware
// verification before any product code is changed.
const SOURCE_LOCAL_CATEGORIES = new Set([
  'i18n-raw-string',
  'ux-dead-link',
  'ux-dead-click',
  'ux-placeholder',
])

type FindingRow = {
  file?: string
  severity?: string
  category?: string
  title?: string
  detail?: string
  recommendation?: string
  line?: number | null
}

type RecoveryDisposition = 'queued' | 'already_active' | 'completed_pending_verification' | 'recently_failed' | 'unavailable'

type ExistingRecovery = {
  disposition: Exclude<RecoveryDisposition, 'queued' | 'unavailable'>
  jobId: string
  error: string
}

function canonicalOwnedPrefix(value: string): boolean {
  const parsed = parseRepoUrl(String(value || '').trim())
  if (!parsed || parsed.repo.toLowerCase() !== REPO.toLowerCase()) return false
  return !parsed.branch || parsed.branch === BASE_BRANCH
}

function requiresRepositoryEvidence(findings: FindingRow[]): boolean {
  return findings.some((finding) => !SOURCE_LOCAL_CATEGORIES.has(String(finding.category || '').trim().toLowerCase()))
}

function recoveryKey(runId: string): string {
  return `audit-findings:${runId}`
}

function compactFinding(finding: FindingRow) {
  return {
    file: String(finding.file || '').slice(0, 240),
    severity: String(finding.severity || '').slice(0, 24),
    category: String(finding.category || '').slice(0, 120),
    title: String(finding.title || '').slice(0, 320),
    detail: String(finding.detail || '').slice(0, 1200),
    recommendation: String(finding.recommendation || '').slice(0, 900),
    line: typeof finding.line === 'number' ? finding.line : null,
  }
}

function syntheticResult(input: {
  runId: string
  approvedAt: string
  findingsTotal: number
  disposition: RecoveryDisposition
  jobId: string
  error?: string
}): ApprovedRunSystemResult {
  const running = input.disposition === 'queued' || input.disposition === 'already_active'
  const verifying = input.disposition === 'completed_pending_verification'
  const lifecycleStatus = running ? 'repairing' : verifying ? 'checks_pending' : 'failed'
  const repairMessage = running
    ? `Repository-aware Self-Healing is running Platform Engineer job ${input.jobId}. The findings are being verified across related source and configuration before any code change.`
    : verifying
      ? `Repository-aware Platform Engineer job ${input.jobId} completed. The Audit finding remains open until independent re-verification proves the issue is gone or unsupported.`
      : input.error || 'Repository-aware Audit recovery could not continue.'

  return {
    kind: 'audit_batch_remediation',
    ok: running || verifying,
    approval: 'final',
    runId: input.runId,
    status: running || verifying ? 'partial' : 'failed',
    branch: '',
    prUrl: '',
    prNumber: 0,
    autoMergeQueued: false,
    autoMergeError: running || verifying ? '' : repairMessage,
    findingsTotal: input.findingsTotal,
    findingsApplied: 0,
    findingsAlreadyResolved: 0,
    filesChanged: 0,
    skipped: [],
    approvedAt: input.approvedAt || new Date().toISOString(),
    lifecycleStatus,
    merged: false,
    mergedAt: '',
    mergeCommitSha: '',
    localizationFilesChanged: 0,
    checkState: running || verifying ? 'pending' : 'failed',
    failedChecks: [],
    pendingChecks: [],
    repairMessage,
  }
}

async function existingRecovery(admin: any, key: string): Promise<ExistingRecovery | null> {
  const active = await admin
    .from('builder_jobs')
    .select('id,status,error,created_at')
    .in('status', ['queued', 'running', 'paused'])
    .contains('metadata', { selfHealingOwnedAudit: true, selfHealingKey: key })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (active.error) throw new Error(`audit_findings_recovery_lookup_failed:${active.error.message}`)
  if (active.data?.id) {
    return { disposition: 'already_active', jobId: String(active.data.id), error: '' }
  }

  const completedSince = new Date(Date.now() - COMPLETED_RECHECK_WINDOW_MS).toISOString()
  const succeeded = await admin
    .from('builder_jobs')
    .select('id,status,error,created_at')
    .eq('status', 'succeeded')
    .gte('created_at', completedSince)
    .contains('metadata', { selfHealingOwnedAudit: true, selfHealingKey: key })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (succeeded.error) throw new Error(`audit_findings_recovery_success_lookup_failed:${succeeded.error.message}`)
  if (succeeded.data?.id) {
    return { disposition: 'completed_pending_verification', jobId: String(succeeded.data.id), error: '' }
  }

  const failedSince = new Date(Date.now() - FAILED_RETRY_SUPPRESSION_MS).toISOString()
  const failed = await admin
    .from('builder_jobs')
    .select('id,status,error,created_at')
    .eq('status', 'failed')
    .gte('created_at', failedSince)
    .contains('metadata', { selfHealingOwnedAudit: true, selfHealingKey: key })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (failed.error) throw new Error(`audit_findings_recovery_failure_lookup_failed:${failed.error.message}`)
  if (failed.data?.id) {
    return {
      disposition: 'recently_failed',
      jobId: String(failed.data.id),
      error: String(failed.data.error || 'Repository-aware Platform Engineer recovery failed and is temporarily retry-suppressed.'),
    }
  }
  return null
}

export async function maybeRecoverOwnedAuditWithRepositoryEvidence(params: {
  admin: any
  runId: string
  actorUserId: string
  failureReason?: string
}): Promise<ApprovedRunSystemResult | null> {
  const [runResult, approvalResult, findingsResult] = await Promise.all([
    params.admin.from('audit_runs').select('id,status,prefix,created_at').eq('id', params.runId).maybeSingle(),
    params.admin.from('audit_remediation_approvals').select('approved_at').eq('run_id', params.runId).maybeSingle(),
    params.admin.from('audit_findings').select('file,severity,category,title,detail,recommendation,line').eq('run_id', params.runId),
  ])

  if (runResult.error || !runResult.data || runResult.data.status !== 'approved') return null
  if (!canonicalOwnedPrefix(String(runResult.data.prefix || ''))) return null
  if (approvalResult.error || !approvalResult.data?.approved_at) return null
  if (findingsResult.error) throw new Error(`audit_findings_recovery_findings_failed:${findingsResult.error.message}`)

  const findings = (findingsResult.data || []) as FindingRow[]
  if (!findings.length) return null
  // Route cross-file/unverifiable model findings directly to repository-aware
  // verification. Source-local deterministic findings keep the existing narrow
  // remediation path unless that path has already failed.
  if (!params.failureReason && !requiresRepositoryEvidence(findings)) return null

  const key = recoveryKey(params.runId)
  const existing = await existingRecovery(params.admin, key)
  if (existing) {
    return syntheticResult({
      runId: params.runId,
      approvedAt: String(approvalResult.data.approved_at),
      findingsTotal: findings.length,
      disposition: existing.disposition,
      jobId: existing.jobId,
      error: existing.error,
    })
  }

  const findingEvidence = findings.slice(0, 24).map(compactFinding)
  const startingPaths = [...new Set([
    ...findings.map((finding) => String(finding.file || '').trim()).filter(Boolean),
    'saas/lib/audit/runner.ts',
    'saas/lib/audit/approvedRunRemediation.ts',
    'saas/lib/audit/findingFreshness.ts',
    'saas/self-healing-host/owned-audit-self-healing.ts',
    'saas/tests/auditOwnedRepositoryRecovery.node.test.ts',
    'saas/tests/builderOwnedSelfHealingQueue.node.test.ts',
  ])].slice(0, 16)

  const objective = [
    'Resolve an owned iTMounts Audit run through repository-aware Self-Healing.',
    `Audit run: ${params.runId}.`,
    params.failureReason ? `Prior narrow remediation failure: ${params.failureReason.slice(0, 1400)}.` : 'The findings require evidence outside a single source file.',
    `Repository starting points (inspect first, not exclusive): ${startingPaths.join(', ')}.`,
    `Audit findings (untrusted claims to verify, not assumed facts): ${JSON.stringify(findingEvidence)}.`,
    'Read ONBOARD.md and scan the current repository before editing.',
    'Verify every Audit finding against related imports, helpers, configuration, tests, and available authoritative runtime evidence before editing.',
    'Do not infer service-role use, database policy, cookie policy, CSRF posture, deployment configuration, or client disclosure from a file that does not contain that evidence.',
    'If a finding is real, repair the root cause with the smallest safe repository change and add regression proof.',
    'If a finding is false or unsupported, do not change secure product code merely to satisfy or silence an unsupported Audit finding. Repair the Audit evidence/verification contract so the false positive does not recur, and add a regression that proves why.',
    'Never weaken the Audit scanner, suppress a category globally, hard-code a passing result, or mark a finding fixed without evidence.',
    'Inside this bounded repair turn, run only narrow directly relevant tests. Never run npm test or the complete repository suite; those full gates belong in PR CI after a candidate patch exists.',
    'Treat exit 137 as execution-resource exhaustion, not as proof that a source defect reproduced. Preserve the investigation for continuation and choose a narrower proof.',
    'Run the relevant narrow Audit/security tests. Re-run the affected Audit scope after the repair when the environment permits; otherwise leave verification explicitly pending rather than claiming fixed. Let the normal PR pipeline run the complete Production build gates.',
  ].join('\n')

  const target = signalBoostDeployedRepairTarget(objective, {
    commitSha: process.env.VERCEL_GIT_COMMIT_SHA,
    branch: process.env.VERCEL_GIT_COMMIT_REF || BASE_BRANCH,
  }, { ownerDeveloperLogSubmission: true })

  if (!target) {
    return syntheticResult({
      runId: params.runId,
      approvedAt: String(approvalResult.data.approved_at),
      findingsTotal: findings.length,
      disposition: 'unavailable',
      jobId: '',
      error: 'audit_findings_recovery_deployed_revision_unavailable',
    })
  }

  try {
    const job = await enqueueSignalBoostRepositoryRepairJob({
      userId: params.actorUserId,
      conversationId: crypto.randomUUID(),
      objective,
      target,
    })

    const row = await params.admin
      .from('builder_jobs')
      .select('metadata')
      .eq('id', job.jobId)
      .eq('user_id', params.actorUserId)
      .maybeSingle()
    if (row.error || !row.data) throw new Error(`audit_findings_recovery_tag_read_failed:${row.error?.message || 'job_not_found'}`)
    const metadata = row.data.metadata && typeof row.data.metadata === 'object' && !Array.isArray(row.data.metadata)
      ? row.data.metadata
      : {}
    const tagged = await params.admin.from('builder_jobs').update({
      metadata: {
        ...metadata,
        selfHealingOwnedAudit: true,
        selfHealingKey: key,
        selfHealingSource: 'audit-console-findings-recovery',
        auditRunId: params.runId,
      },
    }).eq('id', job.jobId).eq('user_id', params.actorUserId)
    if (tagged.error) throw new Error(`audit_findings_recovery_tag_failed:${tagged.error.message}`)

    await params.admin.from('audit_logs').insert({
      run_id: params.runId,
      user_id: params.actorUserId,
      payload: {
        kind: 'audit_self_healing_findings_recovery',
        source: 'self-healing-supervisor',
        ok: true,
        status: 'queued',
        lifecycleStatus: 'repairing',
        jobId: job.jobId,
        remediationKey: key,
        findingsTotal: findings.length,
        at: new Date().toISOString(),
      },
    })

    return syntheticResult({
      runId: params.runId,
      approvedAt: String(approvalResult.data.approved_at),
      findingsTotal: findings.length,
      disposition: 'queued',
      jobId: job.jobId,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'audit_findings_repository_recovery_failed'
    await params.admin.from('audit_logs').insert({
      run_id: params.runId,
      user_id: params.actorUserId,
      payload: {
        kind: 'audit_self_healing_findings_recovery',
        source: 'self-healing-supervisor',
        ok: false,
        status: 'failed',
        lifecycleStatus: 'failed',
        remediationKey: key,
        error: message,
        at: new Date().toISOString(),
      },
    })
    return syntheticResult({
      runId: params.runId,
      approvedAt: String(approvalResult.data.approved_at),
      findingsTotal: findings.length,
      disposition: 'unavailable',
      jobId: '',
      error: message,
    })
  }
}
