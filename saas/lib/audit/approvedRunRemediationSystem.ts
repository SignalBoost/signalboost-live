// End-to-end controller for a durably owner-approved audit run.
//
// The base engine prepares safe source edits on one ai/* branch. This controller
// completes the system contract around it: add required localization catalog
// entries, recover a missing PR, wait for GitHub protections, merge without
// bypassing them, and only then mark findings fixed in Supabase.

import { callAuditModel } from '@/lib/audit/modelRouter'
import { AUDIT_UNTRUSTED_DATA_RULE, encodeAuditUntrustedData } from '@/lib/audit/untrustedData'
import {
  runApprovedAuditRemediation,
  type ApprovedRunRemediationResult,
} from '@/lib/audit/approvedRunRemediation'
import {
  installAuditRemediationLifecycle,
  isAuditLifecycleFunctionMissing,
} from '@/lib/audit/remediationLifecycleRepair'
import { commitFileToBranch, preservedFraction } from '@/lib/ai/tools/repoWriter'

const REPO = 'SignalBoost/signalboost-live'
const OWNER = 'SignalBoost'
const BASE_BRANCH = 'main'
const MAX_GITHUB_ATTEMPTS = 3
const RETRY_DELAYS_MS = [0, 500, 1500] as const
const SUPPORTED_LANGS = ['es', 'pt', 'pl', 'ru'] as const

const ROOT_CATALOG = 'lib/i18n/approvedAuditRemediationCopy.ts'
const SAAS_CATALOG = 'saas/lib/i18n/approvedAuditRemediationCopy.ts'

export type AuditRemediationLifecycleStatus =
  | 'preparing'
  | 'checks_pending'
  | 'checks_failed'
  | 'repairing'
  | 'auto_merge_queued'
  | 'partial'
  | 'merged'
  | 'failed'

export type ApprovedRunSystemResult = ApprovedRunRemediationResult & {
  lifecycleStatus: AuditRemediationLifecycleStatus
  merged: boolean
  mergedAt: string
  mergeCommitSha: string
  localizationFilesChanged: number
  checkState: 'unknown' | 'pending' | 'failed' | 'success'
  failedChecks: string[]
  pendingChecks: string[]
  repairMessage: string
}

type GhResult = {
  ok: boolean
  status: number
  data: any
  error: string
}

type PullRequestRef = {
  number: number
  url: string
  headSha: string
  state: string
  merged: boolean
  mergedAt: string
  mergeCommitSha: string
  mergeable: boolean | null
  mergeableState: string
  baseSha: string
  headRef: string
}

type AuditFindingRow = {
  file?: unknown
  category?: unknown
  detail?: unknown
}

function githubToken(): string | null {
  return process.env.GITHUB_WRITE_TOKEN || null
}

async function github(path: string, init?: RequestInit): Promise<GhResult> {
  const token = githubToken()
  if (!token) return { ok: false, status: 0, data: null, error: 'GITHUB_WRITE_TOKEN is not configured.' }
  try {
    const response = await fetch(`https://api.github.com${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      },
      cache: 'no-store',
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        data,
        error: `GitHub ${init?.method || 'GET'} ${path} failed (${response.status}): ${String(data?.message || 'unknown error')}`,
      }
    }
    return { ok: true, status: response.status, data, error: '' }
  } catch (error) {
    return { ok: false, status: 0, data: null, error: error instanceof Error ? error.message : 'GitHub request failed.' }
  }
}

function transientGithubError(value: string): boolean {
  const normalized = String(value || '').toLowerCase()
  return (
    /\b(429|500|502|503|504)\b/.test(normalized) ||
    normalized.includes('no server is currently available') ||
    normalized.includes('temporarily unavailable') ||
    normalized.includes('timeout') ||
    normalized.includes('timed out') ||
    normalized.includes('connection reset') ||
    normalized.includes('socket hang up')
  )
}

async function withGithubRetry<T>(operation: () => Promise<{ ok: boolean; value?: T; error: string }>): Promise<{ ok: boolean; value?: T; error: string }> {
  let lastError = ''
  for (let attempt = 0; attempt < MAX_GITHUB_ATTEMPTS; attempt += 1) {
    const delay = RETRY_DELAYS_MS[attempt]
    if (delay > 0) await new Promise(resolve => setTimeout(resolve, delay))
    const result = await operation()
    if (result.ok || !transientGithubError(result.error)) return result
    lastError = result.error
  }
  return { ok: false, error: lastError || 'GitHub operation failed after retries.' }
}

function pullRequestRef(data: any): PullRequestRef {
  return {
    number: Number(data?.number || 0),
    url: String(data?.html_url || ''),
    headSha: String(data?.head?.sha || ''),
    state: String(data?.state || ''),
    merged: Boolean(data?.merged),
    mergedAt: String(data?.merged_at || ''),
    mergeCommitSha: String(data?.merge_commit_sha || ''),
    mergeable: typeof data?.mergeable === 'boolean' ? data.mergeable : null,
    mergeableState: String(data?.mergeable_state || ''),
    baseSha: String(data?.base?.sha || ''),
    headRef: String(data?.head?.ref || ''),
  }
}

async function getPullRequest(prNumber: number): Promise<{ ok: boolean; value?: PullRequestRef; error: string }> {
  return withGithubRetry(async () => {
    const result = await github(`/repos/${REPO}/pulls/${prNumber}`)
    return result.ok
      ? { ok: true, value: pullRequestRef(result.data), error: '' }
      : { ok: false, error: result.error }
  })
}



type CheckSummary = {
  state: 'unknown' | 'pending' | 'failed' | 'success'
  failed: string[]
  pending: string[]
  error: string
}

const PASSING_CHECK_CONCLUSIONS = new Set(['success', 'neutral', 'skipped'])

async function getCheckSummary(headSha: string): Promise<CheckSummary> {
  if (!headSha) return { state: 'unknown', failed: [], pending: [], error: 'The remediation head commit is missing.' }
  const [runs, statuses] = await Promise.all([
    github(`/repos/${REPO}/commits/${encodeURIComponent(headSha)}/check-runs?per_page=100`),
    github(`/repos/${REPO}/commits/${encodeURIComponent(headSha)}/status`),
  ])
  if (!runs.ok && !statuses.ok) {
    return { state: 'unknown', failed: [], pending: [], error: [runs.error, statuses.error].filter(Boolean).join(' | ') }
  }

  const failed = new Set<string>()
  const pending = new Set<string>()
  let observed = 0
  for (const run of Array.isArray(runs.data?.check_runs) ? runs.data.check_runs : []) {
    observed += 1
    const name = String(run?.name || 'GitHub check')
    if (String(run?.status || '') !== 'completed') pending.add(name)
    else if (!PASSING_CHECK_CONCLUSIONS.has(String(run?.conclusion || ''))) failed.add(name)
  }
  for (const status of Array.isArray(statuses.data?.statuses) ? statuses.data.statuses : []) {
    observed += 1
    const name = String(status?.context || 'GitHub status')
    const state = String(status?.state || '')
    if (state === 'pending') pending.add(name)
    else if (state === 'failure' || state === 'error') failed.add(name)
  }

  if (failed.size) return { state: 'failed', failed: [...failed].sort(), pending: [...pending].sort(), error: '' }
  if (pending.size || observed === 0) return { state: 'pending', failed: [], pending: [...pending].sort(), error: '' }
  return { state: 'success', failed: [], pending: [], error: '' }
}

async function branchIsBehind(pr: PullRequestRef): Promise<{ behind: boolean; error: string }> {
  if (!pr.baseSha || !pr.headSha) return { behind: false, error: '' }
  const compared = await github(`/repos/${REPO}/compare/${encodeURIComponent(pr.baseSha)}...${encodeURIComponent(pr.headSha)}`)
  if (!compared.ok) return { behind: false, error: compared.error }
  return { behind: Number(compared.data?.behind_by || 0) > 0, error: '' }
}

async function updatePullRequestBranch(pr: PullRequestRef): Promise<{ updated: boolean; error: string }> {
  const result = await github(`/repos/${REPO}/pulls/${pr.number}/update-branch`, {
    method: 'PUT',
    body: JSON.stringify({ expected_head_sha: pr.headSha }),
  })
  if (result.ok) return { updated: true, error: '' }
  if (result.status === 409 || result.status === 422) return { updated: false, error: result.error }
  return { updated: false, error: result.error }
}

async function ensurePullRequest(branch: string, title: string, body: string): Promise<{ ok: boolean; value?: PullRequestRef; error: string }> {
  return withGithubRetry(async () => {
    const existing = await github(`/repos/${REPO}/pulls?head=${OWNER}:${encodeURIComponent(branch)}&state=open&per_page=1`)
    if (!existing.ok) return { ok: false, error: existing.error }
    if (Array.isArray(existing.data) && existing.data.length > 0) {
      return { ok: true, value: pullRequestRef(existing.data[0]), error: '' }
    }

    const created = await github(`/repos/${REPO}/pulls`, {
      method: 'POST',
      body: JSON.stringify({ title, head: branch, base: BASE_BRANCH, body, maintainer_can_modify: true }),
    })
    return created.ok
      ? { ok: true, value: pullRequestRef(created.data), error: '' }
      : { ok: false, error: created.error }
  })
}

async function compareBranch(branch: string): Promise<{ filesChanged: number; error: string }> {
  const compared = await github(`/repos/${REPO}/compare/${BASE_BRANCH}...${encodeURIComponent(branch)}`)
  if (!compared.ok) return { filesChanged: 0, error: compared.error }
  return { filesChanged: Array.isArray(compared.data?.files) ? compared.data.files.length : 0, error: '' }
}

async function queueAutoMerge(prNumber: number): Promise<{ queued: boolean; error: string }> {
  const token = githubToken()
  if (!token) return { queued: false, error: 'GITHUB_WRITE_TOKEN is not configured.' }
  const pr = await github(`/repos/${REPO}/pulls/${prNumber}`)
  const nodeId = pr.ok ? String(pr.data?.node_id || '') : ''
  if (!nodeId) return { queued: false, error: pr.error || 'Could not resolve the pull request node id.' }

  try {
    const response = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: `mutation EnableApprovedAuditAutoMerge($pullRequestId: ID!) {
          enablePullRequestAutoMerge(input: { pullRequestId: $pullRequestId, mergeMethod: SQUASH }) {
            pullRequest { number autoMergeRequest { enabledAt } }
          }
        }`,
        variables: { pullRequestId: nodeId },
      }),
      cache: 'no-store',
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok || Array.isArray(data?.errors)) {
      const error = Array.isArray(data?.errors)
        ? data.errors.map((entry: any) => String(entry?.message || '')).filter(Boolean).join(' | ')
        : `GitHub GraphQL HTTP ${response.status}`
      if (error.toLowerCase().includes('already enabled')) return { queued: true, error: '' }
      return { queued: false, error: error || 'Automatic merge could not be enabled.' }
    }
    return { queued: true, error: '' }
  } catch (error) {
    return { queued: false, error: error instanceof Error ? error.message : 'Automatic merge could not be enabled.' }
  }
}

async function mergeCleanPullRequest(pr: PullRequestRef): Promise<{ merged: boolean; sha: string; error: string }> {
  if (pr.state !== 'open' || pr.mergeable !== true || pr.mergeableState !== 'clean' || !pr.headSha) {
    return { merged: false, sha: '', error: '' }
  }
  const result = await github(`/repos/${REPO}/pulls/${pr.number}/merge`, {
    method: 'PUT',
    body: JSON.stringify({ merge_method: 'squash', sha: pr.headSha }),
  })
  if (!result.ok) {
    if (result.status === 405 || result.status === 409) return { merged: false, sha: '', error: '' }
    return { merged: false, sha: '', error: result.error }
  }
  return {
    merged: Boolean(result.data?.merged),
    sha: String(result.data?.sha || ''),
    error: result.data?.merged ? '' : String(result.data?.message || 'GitHub did not merge the pull request.'),
  }
}

function stripFences(value: string): string {
  const trimmed = String(value || '').trim()
  const match = trimmed.match(/```[a-zA-Z]*\n([\s\S]*?)```/)
  const body = match ? match[1] : trimmed
  return body.endsWith('\n') ? body : `${body}\n`
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function rawTextFromDetail(detail: string): string {
  const explicit = detail.match(/User-facing text\s+["“]([\s\S]*?)["”]\s+is hardcoded/i)
  if (explicit?.[1]) return explicit[1].trim()
  const quoted = detail.match(/["“]([^"”]{2,600})["”]/)
  return quoted?.[1]?.trim() || ''
}

function keyCount(content: string, phrase: string): number {
  const pattern = new RegExp(`['"]${escapeRegExp(phrase)}['"]\\s*:`, 'g')
  return (content.match(pattern) || []).length
}

async function readBranchFile(branch: string, path: string): Promise<{ ok: boolean; content: string; error: string }> {
  const encoded = encodeURIComponent(path).replace(/%2F/g, '/')
  const result = await github(`/repos/${REPO}/contents/${encoded}?ref=${encodeURIComponent(branch)}`)
  if (!result.ok || !result.data?.content) return { ok: false, content: '', error: result.error || `Could not read ${path}.` }
  try {
    return { ok: true, content: Buffer.from(String(result.data.content), 'base64').toString('utf8'), error: '' }
  } catch (error) {
    return { ok: false, content: '', error: error instanceof Error ? error.message : `Could not decode ${path}.` }
  }
}

function validateCatalog(current: string, proposed: string, phrases: string[]): string[] {
  const errors: string[] = []
  if (preservedFraction(current, proposed) < 0.8) errors.push('The translation catalog changed too much.')
  if (!proposed.includes('approvedAuditRemediationText')) errors.push('The catalog export was removed.')
  for (const lang of SUPPORTED_LANGS) {
    if (!new RegExp(`\\b${lang}:\\s*\\{`).test(proposed)) errors.push(`The ${lang} catalog is missing.`)
  }
  for (const phrase of phrases) {
    if (keyCount(proposed, phrase) !== SUPPORTED_LANGS.length) {
      errors.push(`The phrase is not translated exactly once in every supported locale: ${phrase}`)
    }
  }
  return errors
}

async function generateCatalogUpdate(path: string, current: string, phrases: string[]): Promise<{ ok: boolean; content: string; error: string }> {
  const systemPrompt = [
    'You update a TypeScript localization catalog.',
    AUDIT_UNTRUSTED_DATA_RULE,
    'Return ONLY the complete corrected file, with no markdown fences or explanation.',
    'Preserve every existing key, translation, comment, type, and export exactly.',
    'Add each requested English key exactly once inside each es, pt, pl, and ru object.',
    'Translate naturally and professionally; never copy the English value as the translation.',
    'Do not add imports, dependencies, languages, or unrelated changes.',
  ].join(' ')
  const basePrompt = [
    'Add exact ES/PT/PL/RU translations for the supplied owner-approved fallback strings.',
    encodeAuditUntrustedData('localization_catalog_update', { path, phrases, current }),
  ].join('\n')

  let errors: string[] = []
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const prompt = attempt === 0
      ? basePrompt
      : `${basePrompt}\n\nTHE PREVIOUS FILE WAS REJECTED:\n${errors.map(error => `- ${error}`).join('\n')}\nReturn a corrected complete file.`
    const raw = await callAuditModel({ systemPrompt, prompt, maxTokens: 16000 })
    if (!raw?.trim()) {
      errors = ['The audit model did not return a translation catalog.']
      continue
    }
    const proposed = stripFences(raw)
    errors = validateCatalog(current, proposed, phrases)
    if (errors.length === 0) return { ok: true, content: proposed, error: '' }
  }
  return { ok: false, content: '', error: errors.join(' ') || 'The translation catalog could not be generated.' }
}

async function ensureLocalizationCatalogs(params: {
  admin: any
  runId: string
  branch: string
}): Promise<{ ok: boolean; filesChanged: number; prNumber: number; prUrl: string; error: string }> {
  const findings = await params.admin
    .from('audit_findings')
    .select('file,category,detail')
    .eq('run_id', params.runId)
  if (findings.error) return { ok: false, filesChanged: 0, prNumber: 0, prUrl: '', error: findings.error.message }

  const grouped = new Map<string, Set<string>>()
  for (const row of (findings.data || []) as AuditFindingRow[]) {
    if (String(row.category || '').toLowerCase() !== 'i18n-raw-string') continue
    const phrase = rawTextFromDetail(String(row.detail || ''))
    if (!phrase) continue
    const catalog = String(row.file || '').startsWith('saas/') ? SAAS_CATALOG : ROOT_CATALOG
    const phrases = grouped.get(catalog) || new Set<string>()
    phrases.add(phrase)
    grouped.set(catalog, phrases)
  }

  let filesChanged = 0
  let prNumber = 0
  let prUrl = ''
  for (const [catalogPath, phraseSet] of grouped.entries()) {
    const current = await readBranchFile(params.branch, catalogPath)
    if (!current.ok) return { ok: false, filesChanged, prNumber, prUrl, error: current.error }
    const missing = [...phraseSet].filter(phrase => keyCount(current.content, phrase) !== SUPPORTED_LANGS.length)
    if (!missing.length) continue

    const generated = await generateCatalogUpdate(catalogPath, current.content, missing)
    if (!generated.ok) return { ok: false, filesChanged, prNumber, prUrl, error: generated.error }

    const committed = await commitFileToBranch({
      branch: params.branch,
      path: catalogPath,
      content: generated.content,
      message: `AI audit remediation: localize approved run ${params.runId.slice(0, 8)}`,
    })
    if (!committed.ok) return { ok: false, filesChanged, prNumber, prUrl, error: committed.error }
    filesChanged += 1
    if (committed.prNumber) prNumber = committed.prNumber
    if (committed.prUrl) prUrl = committed.prUrl
  }

  return { ok: true, filesChanged, prNumber, prUrl, error: '' }
}

async function finalizeMergedRun(params: {
  admin: any
  runId: string
  actorUserId: string
  pr: PullRequestRef
  fallbackMergeSha?: string
}): Promise<{ ok: boolean; findingsFixed: number; error: string }> {
  const rpcParams = {
    p_run_id: params.runId,
    p_actor_user_id: params.actorUserId,
    p_pr_number: params.pr.number,
    p_pr_url: params.pr.url,
    p_merge_commit_sha: params.pr.mergeCommitSha || params.fallbackMergeSha || '',
  }

  let finalized = await params.admin.rpc('finalize_audit_run_remediation_v2', rpcParams)
  if (finalized.error && isAuditLifecycleFunctionMissing(String(finalized.error.message || ''))) {
    const repair = await installAuditRemediationLifecycle(params.admin)
    if (!repair.ok) return { ok: false, findingsFixed: 0, error: `Lifecycle repair failed at step ${repair.failedStep}: ${repair.error}` }
    finalized = await params.admin.rpc('finalize_audit_run_remediation_v2', rpcParams)
  }
  if (finalized.error) return { ok: false, findingsFixed: 0, error: String(finalized.error.message || 'Could not finalize remediation.') }
  const event = Array.isArray(finalized.data) ? finalized.data[0] : finalized.data
  if (!event?.finalized) return { ok: false, findingsFixed: 0, error: 'The remediation merge was not accepted by the lifecycle finalizer.' }
  return { ok: true, findingsFixed: Number(event.findings_fixed || 0), error: '' }
}

function systemResult(
  base: ApprovedRunRemediationResult,
  patch: Partial<ApprovedRunSystemResult>,
): ApprovedRunSystemResult {
  return {
    ...base,
    lifecycleStatus: 'preparing',
    merged: false,
    mergedAt: '',
    mergeCommitSha: '',
    localizationFilesChanged: 0,
    checkState: 'unknown',
    failedChecks: [],
    pendingChecks: [],
    repairMessage: '',
    ...patch,
  }
}

async function writeLifecycleLog(admin: any, runId: string, actorUserId: string, payload: ApprovedRunSystemResult) {
  const latest = await admin
    .from('audit_logs')
    .select('payload')
    .eq('run_id', runId)
    .eq('payload->>kind', 'audit_batch_remediation')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  const previous = latest.data?.payload
  if (
    previous?.kind === payload.kind &&
    previous?.lifecycleStatus === payload.lifecycleStatus &&
    previous?.prNumber === payload.prNumber &&
    previous?.mergeCommitSha === payload.mergeCommitSha &&
    previous?.findingsApplied === payload.findingsApplied &&
    previous?.filesChanged === payload.filesChanged &&
    previous?.checkState === payload.checkState &&
    JSON.stringify(previous?.failedChecks || []) === JSON.stringify(payload.failedChecks || []) &&
    previous?.repairMessage === payload.repairMessage
  ) return
  await admin.from('audit_logs').insert({ run_id: runId, user_id: actorUserId, payload })
}

async function reconcilePullRequest(params: {
  admin: any
  runId: string
  actorUserId: string
  result: ApprovedRunSystemResult
}): Promise<ApprovedRunSystemResult> {
  const fetched = await getPullRequest(params.result.prNumber)
  if (!fetched.ok || !fetched.value) {
    const failed = systemResult(params.result, {
      ok: false,
      status: 'failed',
      lifecycleStatus: 'failed',
      autoMergeError: fetched.error,
    })
    await writeLifecycleLog(params.admin, params.runId, params.actorUserId, failed)
    return failed
  }

  let pr = fetched.value

  if (params.result.status === 'partial' || params.result.lifecycleStatus === 'partial') {
    const partial = systemResult(params.result, {
      ok: true,
      status: 'partial',
      lifecycleStatus: 'partial',
      autoMergeQueued: false,
      autoMergeError: '',
    })
    await writeLifecycleLog(params.admin, params.runId, params.actorUserId, partial)
    return partial
  }
  if (pr.merged) {
    const finalized = await finalizeMergedRun({
      admin: params.admin,
      runId: params.runId,
      actorUserId: params.actorUserId,
      pr,
    })
    if (!finalized.ok) {
      const failed = systemResult(params.result, {
        ok: false,
        status: 'failed',
        lifecycleStatus: 'failed',
        autoMergeError: finalized.error,
      })
      await writeLifecycleLog(params.admin, params.runId, params.actorUserId, failed)
      return failed
    }
    const merged = systemResult(params.result, {
      ok: true,
      lifecycleStatus: 'merged',
      merged: true,
      mergedAt: pr.mergedAt || new Date().toISOString(),
      mergeCommitSha: pr.mergeCommitSha,
      findingsApplied: finalized.findingsFixed,
      autoMergeError: '',
    })
    await writeLifecycleLog(params.admin, params.runId, params.actorUserId, merged)
    return merged
  }

  if (pr.state !== 'open') {
    const failed = systemResult(params.result, {
      ok: false,
      status: 'failed',
      lifecycleStatus: 'failed',
      autoMergeError: 'The remediation pull request was closed without merging.',
    })
    await writeLifecycleLog(params.admin, params.runId, params.actorUserId, failed)
    return failed
  }


  const checks = await getCheckSummary(pr.headSha)
  if (checks.state === 'failed') {
    const behind = await branchIsBehind(pr)
    if (behind.behind) {
      const update = await updatePullRequestBranch(pr)
      if (update.updated) {
        const repairing = systemResult(params.result, {
ok: true,
status: 'pr_ready',
lifecycleStatus: 'repairing',
checkState: 'pending',
failedChecks: checks.failed,
pendingChecks: [],
repairMessage: 'SignalBoost AI updated the remediation branch with the current main branch. Protected checks are restarting.',
autoMergeQueued: false,
autoMergeError: '',
        })
        await writeLifecycleLog(params.admin, params.runId, params.actorUserId, repairing)
        return repairing
      }
    }

    const checksFailed = systemResult(params.result, {
      ok: true,
      status: 'pr_ready',
      lifecycleStatus: 'checks_failed',
      checkState: 'failed',
      failedChecks: checks.failed,
      pendingChecks: checks.pending,
      repairMessage: '',
      autoMergeQueued: false,
      autoMergeError: `Protected checks failed: ${checks.failed.join(', ') || 'unknown check'}${behind.error ? `. Branch comparison also failed: ${behind.error}` : ''}`,
    })
    await writeLifecycleLog(params.admin, params.runId, params.actorUserId, checksFailed)
    return checksFailed
  }


  const autoMerge = await queueAutoMerge(pr.number)
  if (!autoMerge.queued && checks.state === 'success') {
    const directMerge = await mergeCleanPullRequest(pr)
    if (directMerge.error) {
      const failed = systemResult(params.result, {
        ok: false,
        status: 'failed',
        lifecycleStatus: 'failed',
        autoMergeError: directMerge.error,
      })
      await writeLifecycleLog(params.admin, params.runId, params.actorUserId, failed)
      return failed
    }
    if (directMerge.merged) {
      const refreshed = await getPullRequest(pr.number)
      if (refreshed.ok && refreshed.value) pr = refreshed.value
      else pr = { ...pr, merged: true, mergeCommitSha: directMerge.sha, mergedAt: new Date().toISOString() }
      const finalized = await finalizeMergedRun({
        admin: params.admin,
        runId: params.runId,
        actorUserId: params.actorUserId,
        pr,
        fallbackMergeSha: directMerge.sha,
      })
      if (!finalized.ok) {
        const failed = systemResult(params.result, {
          ok: false,
          status: 'failed',
          lifecycleStatus: 'failed',
          autoMergeError: finalized.error,
        })
        await writeLifecycleLog(params.admin, params.runId, params.actorUserId, failed)
        return failed
      }
      const merged = systemResult(params.result, {
        ok: true,
        lifecycleStatus: 'merged',
        merged: true,
        mergedAt: pr.mergedAt || new Date().toISOString(),
        mergeCommitSha: pr.mergeCommitSha || directMerge.sha,
        findingsApplied: finalized.findingsFixed,
        autoMergeError: '',
      })
      await writeLifecycleLog(params.admin, params.runId, params.actorUserId, merged)
      return merged
    }
  }

  const pending = systemResult(params.result, {
    ok: true,
    status: autoMerge.queued ? 'auto_merge_queued' : 'pr_ready',
    lifecycleStatus: checks.state === 'success' && autoMerge.queued ? 'auto_merge_queued' : 'checks_pending',
    checkState: checks.state,
    failedChecks: checks.failed,
    pendingChecks: checks.pending,
    repairMessage: '',
    autoMergeQueued: autoMerge.queued,
    autoMergeError: autoMerge.queued ? '' : (autoMerge.error || checks.error),
  })
  await writeLifecycleLog(params.admin, params.runId, params.actorUserId, pending)
  return pending
}

export async function runApprovedAuditRemediationSystem(params: {
  admin: any
  runId: string
  actorUserId: string
}): Promise<ApprovedRunSystemResult> {
  const base = await runApprovedAuditRemediation(params)

  if (base.ok && base.status === 'already_resolved') {
    const syntheticPr: PullRequestRef = {
      number: 0,
      url: '',
      headSha: '',
      state: 'closed',
      merged: true,
      mergedAt: new Date().toISOString(),
      mergeCommitSha: 'already-resolved-on-main',
      mergeable: true,
      mergeableState: 'clean',
      baseSha: '',
      headRef: '',
    }
    const finalized = await finalizeMergedRun({ ...params, pr: syntheticPr })
    const result = systemResult(base, finalized.ok ? {
      lifecycleStatus: 'merged',
      merged: true,
      mergedAt: syntheticPr.mergedAt,
      mergeCommitSha: syntheticPr.mergeCommitSha,
      findingsApplied: finalized.findingsFixed,
    } : {
      ok: false,
      status: 'failed',
      lifecycleStatus: 'failed',
      autoMergeError: finalized.error,
    })
    await writeLifecycleLog(params.admin, params.runId, params.actorUserId, result)
    return result
  }

  if (!base.branch && !base.prNumber) {
    const failed = systemResult(base, { lifecycleStatus: 'failed' })
    await writeLifecycleLog(params.admin, params.runId, params.actorUserId, failed)
    return failed
  }

  const localization = await ensureLocalizationCatalogs({
    admin: params.admin,
    runId: params.runId,
    branch: base.branch,
  })
  if (!localization.ok) {
    const failed = systemResult(base, {
      ok: false,
      status: 'failed',
      lifecycleStatus: 'failed',
      autoMergeError: localization.error,
      skipped: [...base.skipped, { file: '(localization)', findingCount: base.findingsTotal, reason: localization.error }],
    })
    await writeLifecycleLog(params.admin, params.runId, params.actorUserId, failed)
    return failed
  }

  let prNumber = base.prNumber || localization.prNumber
  let prUrl = base.prUrl || localization.prUrl
  if (!prNumber || !prUrl) {
    const skippedCount = base.skipped.reduce((sum, item) => sum + Math.max(0, item.findingCount), 0)
    const findingsApplied = Math.max(
      base.findingsApplied,
      base.findingsTotal - base.findingsAlreadyResolved - skippedCount,
    )
    const changed = await compareBranch(base.branch)
    const title = `AI audit remediation — run ${params.runId.slice(0, 8)}`
    const body = [
      '## Owner-approved audit remediation',
      '',
      `Audit run: \`${params.runId}\``,
      `Target: \`${REPO}@${BASE_BRANCH}\``,
      '',
      `- Findings prepared: **${findingsApplied}**`,
      `- Findings already resolved: **${base.findingsAlreadyResolved}**`,
      `- Files changed: **${changed.filesChanged}**`,
      `- Findings skipped by safety rules: **${skippedCount}**`,
      '',
      'The Audit Console will merge this PR automatically only after GitHub reports every protected requirement satisfied.',
    ].join('\n')
    const ensured = await ensurePullRequest(base.branch, title, body)
    if (!ensured.ok || !ensured.value) {
      const failed = systemResult(base, {
        ok: false,
        status: 'failed',
        lifecycleStatus: 'failed',
        findingsApplied,
        filesChanged: changed.filesChanged,
        autoMergeError: ensured.error,
        skipped: [...base.skipped, { file: '(pull request)', findingCount: 0, reason: ensured.error }],
        localizationFilesChanged: localization.filesChanged,
      })
      await writeLifecycleLog(params.admin, params.runId, params.actorUserId, failed)
      return failed
    }
    prNumber = ensured.value.number
    prUrl = ensured.value.url
  }

  const prepared = systemResult(base, {
    ok: true,
    status: base.status === 'partial' ? 'partial' : 'pr_ready',
    lifecycleStatus: base.status === 'partial' ? 'partial' : 'checks_pending',
    prNumber,
    prUrl,
    localizationFilesChanged: localization.filesChanged,
  })
  return reconcilePullRequest({ ...params, result: prepared })
}
