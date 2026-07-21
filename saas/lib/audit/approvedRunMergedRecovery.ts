// Recover an approved remediation after GitHub has merged its PR and optionally
// deleted the source ai/* branch. This check runs before source preparation so a
// deleted branch can never turn a successful merge into a false remediation error.

import type { ApprovedRunSystemResult } from '@/lib/audit/approvedRunRemediationSystem'
import {
  installAuditRemediationLifecycle,
  isAuditLifecycleFunctionMissing,
} from '@/lib/audit/remediationLifecycleRepair'

const OWNER = 'SignalBoost'
const REPO = 'SignalBoost/signalboost-live'

function githubToken(): string | null {
  return process.env.GITHUB_WRITE_TOKEN || null
}

async function github(path: string): Promise<{ ok: boolean; status: number; data: any; error: string }> {
  const token = githubToken()
  if (!token) return { ok: false, status: 0, data: null, error: 'GITHUB_WRITE_TOKEN is not configured.' }
  try {
    const response = await fetch(`https://api.github.com${path}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      cache: 'no-store',
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        data,
        error: `GitHub GET ${path} failed (${response.status}): ${String(data?.message || 'unknown error')}`,
      }
    }
    return { ok: true, status: response.status, data, error: '' }
  } catch (error) {
    return { ok: false, status: 0, data: null, error: error instanceof Error ? error.message : 'GitHub request failed.' }
  }
}

function normalizeCandidate(payload: any): ApprovedRunSystemResult | null {
  if (
    !payload ||
    payload.kind !== 'audit_batch_remediation' ||
    payload.approval !== 'final' ||
    !Number(payload.prNumber) ||
    !String(payload.prUrl || '')
  ) return null

  return {
    ...payload,
    ok: Boolean(payload.ok),
    status: payload.status || 'pr_ready',
    branch: String(payload.branch || ''),
    prUrl: String(payload.prUrl || ''),
    prNumber: Number(payload.prNumber || 0),
    autoMergeQueued: Boolean(payload.autoMergeQueued),
    autoMergeError: String(payload.autoMergeError || ''),
    findingsTotal: Number(payload.findingsTotal || 0),
    findingsApplied: Number(payload.findingsApplied || 0),
    findingsAlreadyResolved: Number(payload.findingsAlreadyResolved || 0),
    filesChanged: Number(payload.filesChanged || 0),
    skipped: Array.isArray(payload.skipped) ? payload.skipped : [],
    approvedAt: String(payload.approvedAt || new Date().toISOString()),
    lifecycleStatus: payload.lifecycleStatus || 'checks_pending',
    merged: Boolean(payload.merged),
    mergedAt: String(payload.mergedAt || ''),
    mergeCommitSha: String(payload.mergeCommitSha || ''),
    localizationFilesChanged: Number(payload.localizationFilesChanged || 0),
    checkState: payload.checkState || 'unknown',
    failedChecks: Array.isArray(payload.failedChecks) ? payload.failedChecks : [],
    pendingChecks: Array.isArray(payload.pendingChecks) ? payload.pendingChecks : [],
    repairMessage: String(payload.repairMessage || ''),
  }
}

async function resolveMergedPullRequest(candidate: ApprovedRunSystemResult): Promise<{
  ok: boolean
  data: any
  error: string
}> {
  const direct = await github(`/repos/${REPO}/pulls/${candidate.prNumber}`)
  if (direct.ok && direct.data?.merged) return { ok: true, data: direct.data, error: '' }

  const branch = String(candidate.branch || '').trim()
  if (!branch) {
    return direct.ok
      ? { ok: true, data: direct.data, error: '' }
      : { ok: false, data: null, error: direct.error }
  }

  const listed = await github(
    `/repos/${REPO}/pulls?head=${OWNER}:${encodeURIComponent(branch)}&state=closed&sort=updated&direction=desc&per_page=20`,
  )
  if (!listed.ok) {
    return direct.ok
      ? { ok: true, data: direct.data, error: '' }
      : { ok: false, data: null, error: listed.error || direct.error }
  }

  for (const row of Array.isArray(listed.data) ? listed.data : []) {
    const prNumber = Number(row?.number || 0)
    if (!prNumber) continue
    if (prNumber === candidate.prNumber && direct.ok) {
      if (direct.data?.merged) return { ok: true, data: direct.data, error: '' }
      continue
    }
    const detail = await github(`/repos/${REPO}/pulls/${prNumber}`)
    if (detail.ok && detail.data?.merged) return { ok: true, data: detail.data, error: '' }
  }

  return direct.ok
    ? { ok: true, data: direct.data, error: '' }
    : { ok: false, data: null, error: direct.error }
}

async function finalize(params: {
  admin: any
  runId: string
  actorUserId: string
  prNumber: number
  prUrl: string
  mergeCommitSha: string
}): Promise<{ ok: boolean; findingsFixed: number; error: string }> {
  const rpcParams = {
    p_run_id: params.runId,
    p_actor_user_id: params.actorUserId,
    p_pr_number: params.prNumber,
    p_pr_url: params.prUrl,
    p_merge_commit_sha: params.mergeCommitSha,
  }
  let result = await params.admin.rpc('finalize_audit_run_remediation_v2', rpcParams)
  if (result.error && isAuditLifecycleFunctionMissing(String(result.error.message || ''))) {
    const repair = await installAuditRemediationLifecycle(params.admin)
    if (!repair.ok) {
      return { ok: false, findingsFixed: 0, error: `Lifecycle repair failed at step ${repair.failedStep}: ${repair.error}` }
    }
    result = await params.admin.rpc('finalize_audit_run_remediation_v2', rpcParams)
  }
  if (result.error) return { ok: false, findingsFixed: 0, error: String(result.error.message || 'Could not finalize remediation.') }
  const event = Array.isArray(result.data) ? result.data[0] : result.data
  if (!event?.finalized) return { ok: false, findingsFixed: 0, error: 'The remediation merge was not accepted by the lifecycle finalizer.' }
  return { ok: true, findingsFixed: Number(event.findings_fixed || 0), error: '' }
}

export async function recoverMergedApprovedRemediation(params: {
  admin: any
  runId: string
  actorUserId: string
}): Promise<ApprovedRunSystemResult | null> {
  const logs = await params.admin
    .from('audit_logs')
    .select('payload')
    .eq('run_id', params.runId)
    .order('created_at', { ascending: false })
    .limit(100)
  if (logs.error) return null

  let candidate: ApprovedRunSystemResult | null = null
  for (const row of logs.data || []) {
    candidate = normalizeCandidate(row?.payload)
    if (candidate) break
  }
  if (!candidate) return null

  const resolvedPull = await resolveMergedPullRequest(candidate)
  if (!resolvedPull.ok) {
    return {
      ...candidate,
      ok: false,
      lifecycleStatus: 'failed',
      merged: false,
      autoMergeError: resolvedPull.error,
    }
  }
  if (!resolvedPull.data?.merged) return null

  const pull = resolvedPull.data
  const resolvedPrNumber = Number(pull?.number || candidate.prNumber)
  const resolvedPrUrl = String(pull?.html_url || candidate.prUrl)
  const mergeCommitSha = String(pull?.merge_commit_sha || candidate.mergeCommitSha || '')
  const mergedAt = String(pull?.merged_at || candidate.mergedAt || new Date().toISOString())
  if (candidate.status === 'partial' || candidate.lifecycleStatus === 'partial') {
    const partial: ApprovedRunSystemResult = {
      ...candidate,
      prNumber: resolvedPrNumber,
      prUrl: resolvedPrUrl,
      ok: true,
      status: 'partial',
      lifecycleStatus: 'partial',
      merged: true,
      mergedAt,
      mergeCommitSha,
      autoMergeQueued: false,
      autoMergeError: 'The pull request merged only a safe subset; unresolved findings remain open.',
    }
    const latest = (logs.data || [])[0]?.payload
    if (
      latest?.lifecycleStatus !== 'partial' ||
      latest?.mergeCommitSha !== mergeCommitSha ||
      latest?.merged !== true ||
      Number(latest?.prNumber || 0) !== resolvedPrNumber
    ) {
      await params.admin.from('audit_logs').insert({
        run_id: params.runId,
        user_id: params.actorUserId,
        payload: partial,
      })
    }
    return partial
  }

  const final = await finalize({
    ...params,
    prNumber: resolvedPrNumber,
    prUrl: resolvedPrUrl,
    mergeCommitSha,
  })
  if (!final.ok) {
    return {
      ...candidate,
      prNumber: resolvedPrNumber,
      prUrl: resolvedPrUrl,
      ok: false,
      lifecycleStatus: 'failed',
      merged: true,
      mergedAt,
      mergeCommitSha,
      autoMergeError: final.error,
    }
  }

  const recovered: ApprovedRunSystemResult = {
    ...candidate,
    prNumber: resolvedPrNumber,
    prUrl: resolvedPrUrl,
    ok: true,
    lifecycleStatus: 'merged',
    merged: true,
    mergedAt,
    mergeCommitSha,
    findingsApplied: final.findingsFixed,
    autoMergeError: '',
    checkState: 'success',
    failedChecks: [],
    pendingChecks: [],
    repairMessage: '',
  }

  const latest = (logs.data || [])[0]?.payload
  if (
    latest?.lifecycleStatus !== 'merged' ||
    latest?.mergeCommitSha !== mergeCommitSha ||
    Number(latest?.findingsApplied || 0) !== final.findingsFixed ||
    Number(latest?.prNumber || 0) !== resolvedPrNumber
  ) {
    await params.admin.from('audit_logs').insert({
      run_id: params.runId,
      user_id: params.actorUserId,
      payload: recovered,
    })
  }
  return recovered
}
