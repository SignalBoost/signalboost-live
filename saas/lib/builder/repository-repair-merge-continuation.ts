import { attemptSignalBoostRepositoryAutoMerge, evaluateAutoMergeDangerCategory, evaluatePullRequestChecks } from './repository-repair-automerge.ts'
import { watchMergedDeployment } from './repository-merge-watch.ts'
import type { StateSnapshotPort } from '../portable/state-snapshot-port.ts'

const GITHUB_API = 'https://api.github.com/repos/SignalBoost/signalboost-live'
export const REPOSITORY_REPAIR_AUTOMERGE_MARKER = 'Owner-authorized Platform Engineer repair.'
const REPAIR_TITLE = 'COS Platform Engineer: verified repository repair'
const REPAIR_BRANCH = /^cos\/platform-repair-[0-9a-f]{8}-[a-z0-9]{1,20}$/
const SAFE_SHA = /^[0-9a-f]{40}$/i
const MAX_CANDIDATES = 4

type RequestLike = typeof fetch
type JsonValue = Record<string, any> | any[]

export type RepositoryRepairMergeContinuationResult = Readonly<{
  enabled: boolean
  candidates: number
  merged: number
  pending: number
  refused: number
  outcomes: ReadonlyArray<Readonly<{
    pullRequestNumber: number
    outcome: 'merged' | 'pending' | 'refused'
    detail: string
    mergeCommitSha: string | null
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
    && base === 'main'
    && headRepo === 'SignalBoost/signalboost-live'
    && REPAIR_BRANCH.test(head)
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
 * finished green. A restorable production snapshot is still mandatory immediately before merge.
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
  // Host-specific builderAutoMergeSnapshotPort() is injected by the cron route; this core module
  // never imports the Vercel adapter, so bare Node regressions exercise the same merge state machine.
  const snapshotPort = input.snapshotPort ?? null

  const open = await requestJson(request, `${GITHUB_API}/pulls?state=open&base=main&per_page=30`, { method: 'GET', headers: writeHeaders })
  const pulls = (Array.isArray(open) ? open : []).filter(isCandidate).slice(0, MAX_CANDIDATES)
  const outcomes: Array<{ pullRequestNumber: number; outcome: 'merged' | 'pending' | 'refused'; detail: string; mergeCommitSha: string | null }> = []

  for (const pull of pulls) {
    if (Date.now() >= deadlineAtMs - 20_000) break
    const pullRequestNumber = Number(pull.number)
    const headSha = String(pull?.head?.sha || '')
    if (!SAFE_SHA.test(headSha)) {
      outcomes.push({ pullRequestNumber, outcome: 'refused', detail: 'The repair PR head SHA is invalid.', mergeCommitSha: null })
      continue
    }

    let evidence: { files: Array<{ path: string; content: string }>; patch: string }
    try {
      evidence = await pullChangeEvidence(request, writeHeaders, pullRequestNumber)
    } catch (error) {
      outcomes.push({ pullRequestNumber, outcome: 'pending', detail: error instanceof Error ? error.message : 'Could not read repair diff.', mergeCommitSha: null })
      continue
    }
    if (!evidence.files.length) {
      outcomes.push({ pullRequestNumber, outcome: 'refused', detail: 'The repair PR contains no changed files.', mergeCommitSha: null })
      continue
    }
    const danger = evaluateAutoMergeDangerCategory(evidence.files, evidence.patch)
    if (!danger.eligible) {
      outcomes.push({ pullRequestNumber, outcome: 'refused', detail: danger.detail || 'Danger policy refused auto-merge.', mergeCommitSha: null })
      continue
    }

    // Check CI before taking a production snapshot. Pending CI is normal and costs no checkpoint;
    // the next cron tick will retry the same immutable PR head.
    const checks = await evaluatePullRequestChecks(request, writeHeaders, pullRequestNumber)
      .catch(error => ({ green: false, detail: error instanceof Error ? error.message : 'Could not read GitHub checks.' }))
    if (!checks.green) {
      outcomes.push({ pullRequestNumber, outcome: 'pending', detail: checks.detail, mergeCommitSha: null })
      continue
    }

    const merge = await attemptSignalBoostRepositoryAutoMerge({
      files: evidence.files,
      patch: evidence.patch,
      pullRequestNumber,
      snapshotPort,
      request,
      token,
    })
    if (!merge.merged || !merge.mergeCommitSha) {
      outcomes.push({ pullRequestNumber, outcome: 'refused', detail: merge.detail || merge.reason || 'Merge refused.', mergeCommitSha: null })
      continue
    }

    let detail = `Merged verified repair PR #${pullRequestNumber} as ${merge.mergeCommitSha}.`
    if (merge.preMergeSnapshotId && snapshotPort && Date.now() < deadlineAtMs - 15_000) {
      const watch = await watchMergedDeployment({
        mergeCommitSha: merge.mergeCommitSha,
        preMergeSnapshotId: merge.preMergeSnapshotId,
        snapshotPort,
        projectId: process.env.VERCEL_PROJECT_ID || '',
        teamId: process.env.VERCEL_TEAM_ID || undefined,
        token: process.env.VERCEL_TOKEN || process.env.VERCEL_API_TOKEN || '',
        deadlineAtMs,
      }).catch(() => null)
      if (watch?.detail) detail += ` ${watch.detail}`
    }
    outcomes.push({ pullRequestNumber, outcome: 'merged', detail, mergeCommitSha: merge.mergeCommitSha })
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
