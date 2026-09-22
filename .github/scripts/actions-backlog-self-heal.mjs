// .github/scripts/actions-backlog-self-heal.mjs
//
// Cancel obsolete GitHub Actions runs without touching current main, the cleanup run itself,
// protected evidence runs, or the current tip of an open pull request.
//
// This script is intentionally dependency-free and uses only the repository-scoped GITHUB_TOKEN.

const repository = String(process.env.GITHUB_REPOSITORY || '').trim()
const token = String(process.env.GITHUB_TOKEN || '').trim()
const currentRunId = Number(process.env.GITHUB_RUN_ID || 0)
const protectedRunIds = new Set(
  String(process.env.PROTECTED_RUN_IDS || '')
    .split(',')
    .map(value => Number(value.trim()))
    .filter(Number.isSafeInteger),
)

if (!repository || !repository.includes('/')) throw new Error('GITHUB_REPOSITORY is required')
if (!token) throw new Error('GITHUB_TOKEN is required')
if (!Number.isSafeInteger(currentRunId) || currentRunId <= 0) throw new Error('GITHUB_RUN_ID is required')

const [owner] = repository.split('/')
const apiBase = 'https://api.github.com'
const ephemeralBranch = /^(?:fix|feat|ci|mcp|ops|chore|test|hotfix|repair|refactor|ai|codex)\//
const patchBranch = /^SignalBoost\/patch-/

async function api(path, options = {}) {
  const response = await fetch(`${apiBase}${path}`, {
    ...options,
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${token}`,
      'x-github-api-version': '2026-03-10',
      ...(options.headers || {}),
    },
  })

  if (response.status === 204) return null
  if (!response.ok) {
    const body = (await response.text()).replace(/\s+/g, ' ').slice(0, 500)
    const error = new Error(`github_api_${response.status}: ${body}`)
    error.status = response.status
    throw error
  }
  return response.json()
}

async function listRuns(status) {
  const all = []
  for (let page = 1; page <= 20; page += 1) {
    const data = await api(
      `/repos/${repository}/actions/runs?status=${encodeURIComponent(status)}&per_page=100&page=${page}`,
    )
    const rows = Array.isArray(data?.workflow_runs) ? data.workflow_runs : []
    all.push(...rows)
    if (rows.length < 100) break
  }
  return all
}

const mainRef = await api(`/repos/${repository}/git/ref/heads/main`)
const mainSha = String(mainRef?.object?.sha || '').trim()
if (!/^[0-9a-f]{40}$/i.test(mainSha)) throw new Error('current main SHA could not be resolved')

const branchTips = new Map([['main', mainSha]])
const openPrBranches = new Map()

async function branchTip(branch) {
  if (branchTips.has(branch)) return branchTips.get(branch)
  try {
    const ref = await api(`/repos/${repository}/git/ref/heads/${encodeURIComponent(branch)}`)
    const sha = String(ref?.object?.sha || '').trim() || null
    branchTips.set(branch, sha)
    return sha
  } catch (error) {
    if (error?.status === 404) {
      branchTips.set(branch, null)
      return null
    }
    throw error
  }
}

async function hasOpenPullRequest(branch) {
  if (openPrBranches.has(branch)) return openPrBranches.get(branch)
  const head = encodeURIComponent(`${owner}:${branch}`)
  const pulls = await api(`/repos/${repository}/pulls?state=open&head=${head}&per_page=1`)
  const open = Array.isArray(pulls) && pulls.length > 0
  openPrBranches.set(branch, open)
  return open
}

function isEphemeral(branch) {
  return ephemeralBranch.test(branch) || patchBranch.test(branch)
}

const runs = [
  ...(await listRuns('queued')),
  ...(await listRuns('in_progress')),
]

const deduped = [...new Map(runs.map(run => [Number(run.id), run])).values()]
  .filter(run => Number.isSafeInteger(Number(run.id)))
  .sort((a, b) => Number(a.id) - Number(b.id))

const summary = {
  schemaVersion: 'actions-backlog-self-heal-v1',
  mainSha,
  scanned: deduped.length,
  cancelled: [],
  preserved: [],
  raced: [],
}

for (const run of deduped) {
  const runId = Number(run.id)
  const branch = String(run.head_branch || '').trim()
  const headSha = String(run.head_sha || '').trim()

  let preserveReason = ''
  if (runId === currentRunId) preserveReason = 'self'
  else if (protectedRunIds.has(runId)) preserveReason = 'explicitly_protected'
  else if (headSha === mainSha) preserveReason = 'current_main'

  if (preserveReason) {
    summary.preserved.push({ runId, workflow: run.name, branch, headSha, reason: preserveReason })
    continue
  }

  let cancelReason = ''
  if (branch === 'main') {
    cancelReason = 'stale_main_revision'
  } else if (!branch) {
    // Unknown branch ownership is not enough evidence to cancel.
    summary.preserved.push({ runId, workflow: run.name, branch, headSha, reason: 'unknown_branch' })
    continue
  } else {
    const tip = await branchTip(branch)
    if (!tip) {
      cancelReason = 'deleted_branch'
    } else if (tip !== headSha) {
      cancelReason = 'superseded_branch_revision'
    } else if (isEphemeral(branch) && !(await hasOpenPullRequest(branch))) {
      cancelReason = 'closed_or_merged_ephemeral_branch'
    }
  }

  if (!cancelReason) {
    summary.preserved.push({ runId, workflow: run.name, branch, headSha, reason: 'current_live_branch_tip' })
    continue
  }

  try {
    await api(`/repos/${repository}/actions/runs/${runId}/cancel`, { method: 'POST' })
    summary.cancelled.push({ runId, workflow: run.name, branch, headSha, reason: cancelReason })
  } catch (error) {
    if (error?.status === 409) {
      summary.raced.push({ runId, workflow: run.name, branch, headSha, reason: 'already_terminal_or_transitioning' })
      continue
    }
    throw error
  }
}

console.log(JSON.stringify({
  mainSha: summary.mainSha,
  scanned: summary.scanned,
  cancelled: summary.cancelled.length,
  preserved: summary.preserved.length,
  raced: summary.raced.length,
}))

const fs = await import('node:fs/promises')
const output = process.env.GITHUB_STEP_SUMMARY
if (output) {
  const reasons = summary.cancelled.reduce((acc, item) => {
    acc[item.reason] = (acc[item.reason] || 0) + 1
    return acc
  }, {})
  const lines = [
    '# Actions backlog self-heal',
    '',
    `- Current main: \`${mainSha}\``,
    `- Runs scanned: **${summary.scanned}**`,
    `- Cancelled: **${summary.cancelled.length}**`,
    `- Preserved: **${summary.preserved.length}**`,
    `- Raced/already terminal: **${summary.raced.length}**`,
    '',
    '## Cancellation reasons',
    '',
    ...Object.entries(reasons).map(([reason, count]) => `- ${reason}: **${count}**`),
    '',
  ]
  await fs.appendFile(output, `${lines.join('\n')}\n`)
}
