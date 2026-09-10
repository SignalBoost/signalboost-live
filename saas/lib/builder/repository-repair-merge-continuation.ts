import { attemptSignalBoostRepositoryAutoMerge, evaluateAutoMergeDangerCategory, evaluatePullRequestChecks } from './repository-repair-automerge.ts'
import { watchMergedDeployment } from './repository-merge-watch.ts'
import type { StateSnapshotPort } from '../portable/state-snapshot-port.ts'
import type { MergeWatchOutcome } from './repository-merge-watch.ts'

const GITHUB_API = 'https://api.github.com/repos/SignalBoost/signalboost-live'
export const REPOSITORY_REPAIR_AUTOMERGE_MARKER = 'Owner-authorized Platform Engineer repair.'
const REPAIR_TITLE = 'COS Platform Engineer: verified repository repair'
const REPAIR_BRANCH = /^cos\/platform-repair-[0-9a-f]{8}-[a-z0-9]{1,20}$/
const SAFE_SHA = /^[0-9a-f]{40}$/i
const SAFE_BRANCH = /^(?![-/])(?!.*(?:\.\.|\/\/))[A-Za-z0-9._/-]{1,180}$/
const MAX_CANDIDATES = 4

type RequestLike = typeof fetch
type JsonValue = Record<string, any> | any[]
export type RepositoryRepairMergeReason =
  | 'invalid_head'
  | 'invalid_pinned_base'
  | 'base_unverifiable'
  | 'base_superseded'
  | 'diff_unavailable'
  | 'empty_diff'
  | 'danger_category'
  | 'checks_not_green'
  | 'merge_refused'
  | null

export type RepositoryRepairMergeContinuationResult = Readonly<{
  enabled: boolean
  candidates: number
  merged: number
  pending: number
  refused: number
  outcomes: ReadonlyArray<Readonly<{
    pullRequestNumber: number
    outcome: 'merged' | 'pending' | 'refused'
    reason: RepositoryRepairMergeReason
    baseBranch: string
    detail: string
    mergeCommitSha: string | null
    mergeWatchOutcome?: MergeWatchOutcome | null
    deploymentId?: string | null
    deploymentState?: string | null
  }>>
}>

function enabled(): boolean {
  return String(process.env.BUILDER_AUTO_MERGE_ENABLED || '').trim().toLowerCase() === 'true'
}

function headers(token: string): Record<string, string> {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    'User-Agent': 'SignalBoost-COS-Platform-Engineer',
    'X-GitHub-Api-Version': '2022-11-28',
  }
}

function encodedBranch(branch: string): string {
  return branch.split('/').map(encodeURIComponent).join('/')
}

async function requestJson(request: RequestLike, url: string, init: RequestInit = {}): Promise<JsonValue> {
  const response = await request(url, init)
  const payload = await response.json().catch(() => ({})) as JsonValue
  if (!response.ok) throw new Error(`repository_repair_merge_continuation_http_${response.status}`)
  return payload
}

function isCandidate(value: any): boolean {
  const number = Number(value?.number)
  const body = String(value?.body || '')
  const title = String(value?.title || '')
  const base = String(value?.base?.ref || '')
  const head = String(value?.head?.ref || '')
  const headRepo = String(value?.head?.repo?.full_name || '')
  return Number.isInteger(number) && number > 0
    && title === REPAIR_TITLE
    && body.split(/\r?\n/).some(line => line.trim() === REPOSITORY_REPAIR_AUTOMERGE_MARKER)
    && SAFE_BRANCH.test(base)
    && base !== head
    && headRepo === 'SignalBoost/signalboost-live'
    && REPAIR_BRANCH.test(head)
}

function pinnedBaseSha(body: string): string | null {
  const match = String(body || '').match(/(?:^|\n)Pinned base:\s*`([0-9a-f]{40})`\s*(?:\n|$)/i)
  return match && SAFE_SHA.test(match[1]) ? match[1].toLowerCase() : null
}

async function currentBranchHeadSha(
  request: RequestLike,
  writeHeaders: Record<string, string>,
  branch: string,
): Promise<string | null> {
  const payload = await requestJson(
    request,
    `${GITHUB_API}/git/ref/heads/${encodedBranch(branch)}`,
    { method: 'GET', headers: writeHeaders },
  )
  const sha = String((payload as Record<string, any>)?.object?.sha || '').toLowerCase()
  return SAFE_SHA.test(sha) ? sha : null
}

async function closeSupersededRepairPullRequest(
  request: RequestLike,
  writeHeaders: Record<string, string>,
  pullRequestNumber: number,
): Promise<boolean> {
  try {
    await requestJson(
      request,
      `${GITHUB_API}/pulls/${pullRequestNumber}`,
      { method: 'PATCH', headers: writeHeaders, body: JSON.stringify({ state: 'closed' }) },
    )
    return true
  } catch {
    return false
  }
}

async function pullChangeEvidence(request: RequestLike, writeHeaders: Record<string, string>, pullRequestNumber: number) {
  const payload = await requestJson(
    request,
    `${GITHUB_API}/pulls/${pullRequestNumber}/files?per_page=100`,
    { method: 'GET', headers: writeHeaders },
  )
  const rows = Array.isArray(payload) ? payload : []
  const files = rows
    .filter((row: any) => typeof row?.filename === 'string')
    .map((row: any) => ({ path: String(row.filename), content: '' }))
  const patch = rows.map((row: any) => typeof row?.patch === 'string' ? row.patch : '').filter(Boolean).join('\n')
  return { files, patch }
}

/**
 * Durable completion for owner-authorized Platform Engineer repairs. The initial Builder job may
 * finish before GitHub CI does, so the minute cron revisits only server-marked repair PRs. It never
 * invents work, never widens the danger policy, and never merges until GitHub reports every check
 * finished green.
 *
 * Main repairs are production mutations and still require a restorable production checkpoint.
 * A repair of a feature/preview branch may merge only back into that exact branch, only while the
 * branch head still equals the pinned failed revision. If another writer advances the branch, the
 * repair is stale: the PR is closed and the originating Builder job is reconciled as superseded.
 */
export async function completePendingRepositoryRepairMerges(input: {
  request?: RequestLike
  token?: string
  snapshotPort?: StateSnapshotPort | null
  deadlineAtMs?: number
} = {}): Promise<RepositoryRepairMergeContinuationResult> {
  if (!enabled()) return Object.freeze({ enabled: false, candidates: 0, merged: 0, pending: 0, refused: 0, outcomes: [] })

  const token = String(input.token ?? process.env.GITHUB_WRITE_TOKEN ?? '').trim()
  if (!token) return Object.freeze({ enabled: true, candidates: 0, merged: 0, pending: 0, refused: 1, outcomes: [] })
  const request = input.request ?? fetch
  const writeHeaders = headers(token)
  const deadlineAtMs = Number.isFinite(Number(input.deadlineAtMs)) ? Number(input.deadlineAtMs) : Date.now() + 240_000
  const snapshotPort = input.snapshotPort ?? null

  const open = await requestJson(request, `${GITHUB_API}/pulls?state=open&per_page=100`, { method: 'GET', headers: writeHeaders })
  const pulls = (Array.isArray(open) ? open : []).filter(isCandidate).slice(0, MAX_CANDIDATES)
  const outcomes: Array<{
    pullRequestNumber: number
    outcome: 'merged' | 'pending' | 'refused'
    reason: RepositoryRepairMergeReason
    baseBranch: string
    detail: string
    mergeCommitSha: string | null
    mergeWatchOutcome?: MergeWatchOutcome | null
    deploymentId?: string | null
    deploymentState?: string | null
  }> = []

  for (const pull of pulls) {
    if (Date.now() >= deadlineAtMs - 20_000) break
    const pullRequestNumber = Number(pull.number)
    const headSha = String(pull?.head?.sha || '')
    const baseBranch = String(pull?.base?.ref || '')
    const pinnedBase = pinnedBaseSha(String(pull?.body || ''))
    if (!SAFE_SHA.test(headSha)) {
      outcomes.push({ pullRequestNumber, outcome: 'refused', reason: 'invalid_head', baseBranch, detail: 'The repair PR head SHA is invalid.', mergeCommitSha: null })
      continue
    }
    if (!pinnedBase) {
      outcomes.push({ pullRequestNumber, outcome: 'refused', reason: 'invalid_pinned_base', baseBranch, detail: 'The repair PR does not contain a valid pinned base SHA.', mergeCommitSha: null })
      continue
    }

    let currentBase: string | null = null
    try {
      currentBase = await currentBranchHeadSha(request, writeHeaders, baseBranch)
    } catch (error) {
      outcomes.push({
        pullRequestNumber,
        outcome: 'pending',
        reason: 'base_unverifiable',
        baseBranch,
        detail: error instanceof Error ? error.message : 'Could not verify the current repair base branch.',
        mergeCommitSha: null,
      })
      continue
    }
    if (!currentBase) {
      outcomes.push({ pullRequestNumber, outcome: 'pending', reason: 'base_unverifiable', baseBranch, detail: `Could not identify the current head of ${baseBranch}.`, mergeCommitSha: null })
      continue
    }
    if (currentBase !== pinnedBase) {
      const closed = await closeSupersededRepairPullRequest(request, writeHeaders, pullRequestNumber)
      outcomes.push({
        pullRequestNumber,
        outcome: 'refused',
        reason: 'base_superseded',
        baseBranch,
        detail: `The repair targeted ${pinnedBase.slice(0, 12)} on ${baseBranch}, but that branch is now ${currentBase.slice(0, 12)}. The stale repair PR ${closed ? 'was closed' : 'could not be closed'} and was not merged.`,
        mergeCommitSha: null,
      })
      continue
    }

    let evidence: { files: Array<{ path: string; content: string }>; patch: string }
    try {
      evidence = await pullChangeEvidence(request, writeHeaders, pullRequestNumber)
    } catch (error) {
      outcomes.push({ pullRequestNumber, outcome: 'pending', reason: 'diff_unavailable', baseBranch, detail: error instanceof Error ? error.message : 'Could not read repair diff.', mergeCommitSha: null })
      continue
    }
    if (!evidence.files.length) {
      outcomes.push({ pullRequestNumber, outcome: 'refused', reason: 'empty_diff', baseBranch, detail: 'The repair PR contains no changed files.', mergeCommitSha: null })
      continue
    }
    const danger = evaluateAutoMergeDangerCategory(evidence.files, evidence.patch)
    if (!danger.eligible) {
      outcomes.push({ pullRequestNumber, outcome: 'refused', reason: 'danger_category', baseBranch, detail: danger.detail || 'Danger policy refused auto-merge.', mergeCommitSha: null })
      continue
    }

    const checks = await evaluatePullRequestChecks(request, writeHeaders, pullRequestNumber)
      .catch(error => ({ green: false, detail: error instanceof Error ? error.message : 'Could not read GitHub checks.' }))
    if (!checks.green) {
      outcomes.push({ pullRequestNumber, outcome: 'pending', reason: 'checks_not_green', baseBranch, detail: checks.detail, mergeCommitSha: null })
      continue
    }

    const productionMerge = baseBranch === 'main'
    const merge = await attemptSignalBoostRepositoryAutoMerge({
      files: evidence.files,
      patch: evidence.patch,
      pullRequestNumber,
      snapshotPort: productionMerge ? snapshotPort : null,
      requireProductionSnapshot: productionMerge,
      request,
      token,
    })
    if (!merge.merged || !merge.mergeCommitSha) {
      outcomes.push({ pullRequestNumber, outcome: 'refused', reason: 'merge_refused', baseBranch, detail: merge.detail || merge.reason || 'Merge refused.', mergeCommitSha: null })
      continue
    }

    let detail = `Merged verified repair PR #${pullRequestNumber} into ${baseBranch} as ${merge.mergeCommitSha}.`
    let mergeWatchOutcome: MergeWatchOutcome | null = null
    let deploymentId: string | null = null
    let deploymentState: string | null = null
    if (productionMerge && merge.preMergeSnapshotId && snapshotPort && Date.now() < deadlineAtMs - 15_000) {
      const watch = await watchMergedDeployment({
        mergeCommitSha: merge.mergeCommitSha,
        preMergeSnapshotId: merge.preMergeSnapshotId,
        snapshotPort,
        projectId: process.env.VERCEL_PROJECT_ID || '',
        teamId: process.env.VERCEL_TEAM_ID || undefined,
        token: process.env.VERCEL_TOKEN || process.env.VERCEL_API_TOKEN || '',
        deadlineAtMs,
      }).catch(() => null)
      if (watch) {
        mergeWatchOutcome = watch.outcome
        deploymentId = watch.deploymentId
        deploymentState = watch.deploymentState
        if (watch.detail) detail += ` ${watch.detail}`
      }
    }
    outcomes.push({ pullRequestNumber, outcome: 'merged', reason: null, baseBranch, detail,
      mergeCommitSha: merge.mergeCommitSha, mergeWatchOutcome, deploymentId, deploymentState })
  }

  return Object.freeze({
    enabled: true,
    candidates: pulls.length,
    merged: outcomes.filter(item => item.outcome === 'merged').length,
    pending: outcomes.filter(item => item.outcome === 'pending').length,
    refused: outcomes.filter(item => item.outcome === 'refused').length,
    outcomes: Object.freeze(outcomes.map(item => Object.freeze(item))),
  })
}
