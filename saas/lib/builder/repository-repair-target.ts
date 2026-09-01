import { analyzeOperationalLog } from '../ai/cos/pastedOperationalLog.ts'

export const SIGNALBOOST_REPOSITORY = 'SignalBoost/signalboost-live' as const
export const SIGNALBOOST_REPOSITORY_URL = 'https://github.com/SignalBoost/signalboost-live.git' as const

export type SignalBoostRepositoryRepairTarget = Readonly<{
  trigger: 'failed_build_log' | 'deployed_platform_objective'
  repository: typeof SIGNALBOOST_REPOSITORY
  repositoryUrl: typeof SIGNALBOOST_REPOSITORY_URL
  branch: string
  commitSha: string
  fullCommitSha: string | null
  projectRoot: 'saas'
  pathHints: readonly string[]
  symbolHints: readonly string[]
  failedCommand: string | null
  failureEvidence: readonly string[]
  rawLog: string
}>

const CLONE_LINE = /Cloning\s+(?:https?:\/\/)?github\.com\/SignalBoost\/signalboost-live(?:\.git)?\s*\(Branch:\s*([^,\r\n]+),\s*Commit:\s*([0-9a-f]{7,40})\)/i
const SAFE_BRANCH = /^(?![-/])(?!.*(?:\.\.|\/\/))[A-Za-z0-9._/-]{1,180}$/
const SOURCE_PATH = /(?:\.\/([A-Za-z0-9_@.+-]+(?:\/[A-Za-z0-9_@.+-]+)*\.[A-Za-z0-9]+)|(saas\/[A-Za-z0-9_@.+-]+(?:\/[A-Za-z0-9_@.+-]+)*\.[A-Za-z0-9]+))(?::\d+(?::\d+)?)?/g
const MAX_FAILURE_EVIDENCE = 40
const EXPLICIT_PLATFORM_REPAIR = /(?:^|[\n.!?]\s*)(?:please\s+)?(?:debug|fix|repair|troubleshoot|correct)\s+(?:(?:my|the)\s+)?(?:builder|signalboost(?:\s+platform)?|repository|repo|platform)\b|(?:^|[\n.!?]\s*)(?:(?:my|the)\s+)?(?:builder|signalboost(?:\s+platform)?|repository|repo|platform)\s+(?:is\s+|keeps?\s+)?(?:broken|failing|not\s+working)\b/i

function unique(values: readonly string[], limit: number): readonly string[] {
  return Object.freeze([...new Set(values.map(value => value.trim()).filter(Boolean))].slice(0, limit))
}

function normalizedLogLines(input: string): string[] {
  return String(input || '')
    .replace(/(\d{2}:\d{2}:\d{2}\.\d{3}\s+)/g, '\n$1')
    .replace(/\r/g, '')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
}

function sourcePaths(input: string): readonly string[] {
  const paths: string[] = []
  for (const match of input.matchAll(SOURCE_PATH)) {
    const path = match[1] || match[2]
    if (!path) continue
    paths.push(path.startsWith('saas/') ? path : `saas/${path}`)
  }
  return unique(paths, 32)
}

function symbolNames(input: string): readonly string[] {
  const values: string[] = []
  const patterns = [
    /Export\s+([A-Za-z_$][\w$]*)\s+doesn['’]t exist/gi,
    /The export\s+([A-Za-z_$][\w$]*)\s+was not found/gi,
    /Cannot find name\s+['"]([A-Za-z_$][\w$]*)['"]/gi,
    /has no exported member\s+['"]([A-Za-z_$][\w$]*)['"]/gi,
  ]
  for (const pattern of patterns) {
    for (const match of input.matchAll(pattern)) values.push(match[1])
  }
  return unique(values, 16)
}

function failureEvidence(input: string): readonly string[] {
  const selected = normalizedLogLines(input).filter(line =>
    /Build error occurred|Turbopack build failed|\bError:|doesn['’]t exist|was not found|Cannot find|has no exported member|Import trace:|Command .* exited with [1-9]|\b(?:fail|failed)\b/i.test(line),
  )
  return unique(selected.map(line => line.slice(0, 900)), MAX_FAILURE_EVIDENCE)
}

/**
 * Repository repair is deliberately limited to an exact failed SignalBoost snapshot named by
 * Vercel build evidence. Arbitrary repositories, moving branches, and successful logs are rejected.
 */
export function parseSignalBoostRepositoryRepairTarget(input: string): SignalBoostRepositoryRepairTarget | null {
  const rawLog = String(input || '').trim()
  if (!rawLog) return null
  const analysis = analyzeOperationalLog(rawLog)
  if (!analysis.failed) return null
  const clone = CLONE_LINE.exec(rawLog)
  if (!clone) return null
  const branch = clone[1].trim()
  const commitSha = clone[2].toLowerCase()
  if (!SAFE_BRANCH.test(branch) || !/^[0-9a-f]{7,40}$/.test(commitSha)) return null

  return Object.freeze({
    trigger: 'failed_build_log',
    repository: SIGNALBOOST_REPOSITORY,
    repositoryUrl: SIGNALBOOST_REPOSITORY_URL,
    branch,
    commitSha,
    fullCommitSha: commitSha.length === 40 ? commitSha : null,
    projectRoot: 'saas',
    pathHints: sourcePaths(rawLog),
    symbolHints: symbolNames(rawLog),
    failedCommand: analysis.command,
    failureEvidence: failureEvidence(rawLog),
    rawLog,
  })
}

/**
 * An authenticated owner can explicitly ask the direct Builder surface to repair the configured
 * SignalBoost platform. The host, not the model or user text, supplies the immutable deployed
 * revision. This connects Builder to Platform Engineer without granting a moving branch, arbitrary
 * repository, commit, merge, deploy, or self-approval authority.
 */
export function signalBoostDeployedRepairTarget(
  input: string,
  deployment: { commitSha?: unknown; branch?: unknown },
): SignalBoostRepositoryRepairTarget | null {
  const objective = String(input || '').trim()
  const commitSha = String(deployment.commitSha || '').trim().toLowerCase()
  const branch = String(deployment.branch || 'main').trim()
  if (!objective || !EXPLICIT_PLATFORM_REPAIR.test(objective)) return null
  if (!/^[0-9a-f]{40}$/.test(commitSha) || !SAFE_BRANCH.test(branch)) return null
  return Object.freeze({
    trigger: 'deployed_platform_objective',
    repository: SIGNALBOOST_REPOSITORY,
    repositoryUrl: SIGNALBOOST_REPOSITORY_URL,
    branch,
    commitSha,
    fullCommitSha: commitSha,
    projectRoot: 'saas',
    pathHints: sourcePaths(objective),
    symbolHints: symbolNames(objective),
    failedCommand: analyzeOperationalLog(objective).command,
    failureEvidence: failureEvidence(objective),
    rawLog: objective,
  })
}

export async function resolveSignalBoostRepositoryCommit(
  target: SignalBoostRepositoryRepairTarget,
  request: typeof fetch = fetch,
): Promise<SignalBoostRepositoryRepairTarget> {
  if (target.fullCommitSha) return target
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 8_000)
  try {
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'SignalBoost-COS-Builder',
      'X-GitHub-Api-Version': '2022-11-28',
    }
    const token = String(process.env.GITHUB_TOKEN || '').trim()
    if (token) headers.Authorization = `Bearer ${token}`
    const response = await request(
      `https://api.github.com/repos/SignalBoost/signalboost-live/commits/${encodeURIComponent(target.commitSha)}`,
      { headers, signal: controller.signal },
    )
    if (!response.ok) throw new Error(`builder_repository_revision_lookup_http_${response.status}`)
    const payload = await response.json().catch(() => null) as { sha?: unknown } | null
    const fullCommitSha = typeof payload?.sha === 'string' ? payload.sha.toLowerCase() : ''
    if (!/^[0-9a-f]{40}$/.test(fullCommitSha) || !fullCommitSha.startsWith(target.commitSha)) {
      throw new Error('builder_repository_revision_mismatch')
    }
    return Object.freeze({ ...target, fullCommitSha })
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('builder_repository_')) throw error
    throw new Error('builder_repository_revision_unavailable')
  } finally {
    clearTimeout(timer)
  }
}

export function signalBoostRepositoryRepairObjective(target: SignalBoostRepositoryRepairTarget): string {
  const paths = target.pathHints.map(path => path.replace(/^saas\//, ''))
  const command = target.failedCommand ? `Failed command: ${target.failedCommand}` : 'Failed command: not extracted from the log.'
  const evidence = target.failureEvidence.length
    ? target.failureEvidence.join('\n')
    : target.trigger === 'failed_build_log'
      ? 'The pasted build evidence ended with a non-zero command exit.'
      : 'No failing command was supplied. Inspect the current implementation and existing regressions, reproduce the reported behavior, and do not edit until a proof command fails.'
  return [
    target.trigger === 'failed_build_log'
      ? `Repair the failed ${target.repository} build at exact commit ${target.fullCommitSha || target.commitSha}.`
      : `Diagnose and prepare a verified repair for ${target.repository} at exact deployed commit ${target.fullCommitSha || target.commitSha}.`,
    `The host mounted the pinned repository's ${target.projectRoot}/ directory as this isolated workspace. Tool paths are relative to ${target.projectRoot}/.`,
    'Inspect the implicated source, reproduce the failure with the narrowest relevant command, make the smallest source repair, and rerun the same command until it passes.',
    'Do not weaken tests, access another repository, use the network, commit, push, merge, deploy, or claim success without fail-before/pass-after evidence.',
    command,
    paths.length ? `Path hints: ${paths.join(', ')}` : '',
    target.symbolHints.length ? `Symbol hints: ${target.symbolHints.join(', ')}` : '',
    `Failure evidence:\n${evidence}`,
  ].filter(Boolean).join('\n\n').slice(0, 7_900)
}
