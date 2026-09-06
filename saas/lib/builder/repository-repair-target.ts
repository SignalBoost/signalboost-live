// saas/lib/builder/repository-repair-target.ts
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
  /** Imports the build could not resolve — files the repair must create. */
  missingModuleHints: readonly string[]
  failedCommand: string | null
  failureEvidence: readonly string[]
  rawLog: string
}>

const CLONE_LINE = /Cloning\s+(?:https?:\/\/)?github\.com\/SignalBoost\/signalboost-live(?:\.git)?\s*\(Branch:\s*([^,\r\n]+),\s*Commit:\s*([0-9a-f]{7,40})\)/i
const SAFE_BRANCH = /^(?![-/])(?!.*(?:\.\.|\/\/))[A-Za-z0-9._/-]{1,180}$/
const SOURCE_PATH = /(?:\.\/([A-Za-z0-9_@.+-]+(?:\/[A-Za-z0-9_@.+-]+)*\.[A-Za-z0-9]+)|(saas\/[A-Za-z0-9_@.+-]+(?:\/[A-Za-z0-9_@.+-]+)*\.[A-Za-z0-9]+))(?::\d+(?::\d+)?)?/g
const TEST_PATH = /\b((?:tests|test)\/[A-Za-z0-9_@.+/-]+\.test\.(?:ts|tsx|js|mjs|cjs|mts|cts))(?::\d+(?::\d+)?)?/gi
const MAX_FAILURE_EVIDENCE = 40
const EXPLICIT_PLATFORM_REPAIR = /(?:^|[\n.!?]\s*)(?:please\s+)?(?:debug|fix|repair|troubleshoot|correct)\s+(?:(?:my|the)\s+)?(?:builder|signalboost(?:\s+platform)?|repository|repo|platform)\b|(?:^|[\n.!?]\s*)(?:(?:my|the)\s+)?(?:builder|signalboost(?:\s+platform)?|repository|repo|platform)\s+(?:is\s+|keeps?\s+)?(?:broken|failing|not\s+working)\b/i
const PLATFORM_REPAIR_ACTION = /\b(?:debug|fix|repair|troubleshoot|correct|diagnose|resolve)\b/i
const PLATFORM_REPAIR_SUBJECT = /\b(?:builder|cos|signalboost(?:\s+platform)?|repository|repo|platform)\b/i
const PLATFORM_REPAIR_FAILURE = /\b(?:broken|failed|failing|stuck|not\s+working|did\s+not\s+(?:arrive|complete|produce|return)|finished\s+without|still\s+running|job\s+status|final\s+result|verifiable\s+(?:result|success|failure|outcome)|clear\s+(?:success|completion)|underlying\s+platform\s+issue)\b/i

function isExplicitPlatformRepairObjective(input: string): boolean {
  const objective = String(input || '').trim()
  return EXPLICIT_PLATFORM_REPAIR.test(objective)
    || (
      PLATFORM_REPAIR_ACTION.test(objective)
      && PLATFORM_REPAIR_SUBJECT.test(objective)
      && PLATFORM_REPAIR_FAILURE.test(objective)
    )
}

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

function failingSectionLines(input: string): readonly string[] {
  const lines = normalizedLogLines(input)
  const start = lines.findIndex(line => /(?:^|\s)✖\s+failing tests\s*:/i.test(line))
  if (start >= 0) return lines.slice(start)
  return lines.filter(line => /\btest at\s+(?:tests|test)\//i.test(line))
}

function failingTestPaths(input: string): readonly string[] {
  const paths: string[] = []
  for (const line of failingSectionLines(input)) {
    for (const match of line.matchAll(TEST_PATH)) {
      const path = match[1]
      if (path) paths.push(`saas/${path}`)
    }
  }
  return unique(paths, 12)
}

function sourcePaths(input: string): readonly string[] {
  const failingTests = new Set(failingTestPaths(input))
  const paths: string[] = [...failingTests]
  for (const match of input.matchAll(SOURCE_PATH)) {
    const path = match[1] || match[2]
    if (!path) continue
    const normalized = path.startsWith('saas/') ? path : `saas/${path}`
    // Vercel prints every executed test path in module warnings. Those are not repair targets.
    // Keep test paths only when the final failing-test section identifies them explicitly.
    if (/^saas\/(?:tests|test)\//i.test(normalized) && !failingTests.has(normalized)) continue
    paths.push(normalized)
  }
  return unique(paths, 32)
}

// A bundler that cannot resolve an import is naming a FILE THAT DOES NOT EXIST, and that
// is invisible to every other extractor here: there is no failing test, no missing export,
// no type error — only a specifier. Without this, the repair lane is handed half the failure
// and can honestly fix what it was given while the build stays broken for the other reason.
//
// Specifiers are normalized to workspace paths. '@/' is this repository's alias for the saas
// project root, and an extensionless specifier is reported as its .ts candidate, because that
// is what the repair has to create.
// "Can't resolve" contributes its own apostrophe, so the line carries an ODD number of quote
// characters and any naive pairing captures "t resolve " instead of the module. Anchor on the
// word that actually precedes the specifier.
const UNRESOLVED_MODULE = /(?:resolve|Cannot find module)\s+['"`]([^'"`\n]+)['"`]/i

function unresolvedModulePaths(input: string): readonly string[] {
  const paths: string[] = []
  for (const line of normalizedLogLines(input)) {
    if (!/Module not found|Cannot find module/i.test(line)) continue
    const specifier = String(UNRESOLVED_MODULE.exec(line)?.[1] || '').trim()
    // Bare package names are a dependency problem, not a missing source file, and this lane
    // must never be pointed at node_modules.
    if (!specifier || !/^(?:@\/|\.{1,2}\/)/.test(specifier)) continue
    const relative = specifier.startsWith('@/') ? specifier.slice(2) : specifier.replace(/^\.{1,2}\//, '')
    if (!relative || relative.includes('..')) continue
    const normalized = relative.startsWith('saas/') ? relative : `saas/${relative}`
    paths.push(/\.[a-z]+$/i.test(normalized) ? normalized : `${normalized}.ts`)
  }
  return unique(paths, 12)
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
  const lines = normalizedLogLines(input)
  const failingStart = lines.findIndex(line => /(?:^|\s)✖\s+failing tests\s*:/i.test(line))
  const scoped = failingStart >= 0 ? lines.slice(failingStart) : lines
  const selected = scoped.filter(line =>
    /(?:^|\s)✖\s|\btest at\s+(?:tests|test)\/|AssertionError|ERR_ASSERTION|Build error occurred|Turbopack build failed|Failed to type check|Type error:|\bError:|doesn['’]t exist|was not found|Cannot find|has no exported member|Import trace:|Command .* exited with [1-9]|\bexpected:|\bactual:|\boperator:/i.test(line),
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
    missingModuleHints: unresolvedModulePaths(rawLog),
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
  options: { ownerDeveloperLogSubmission?: boolean } = {},
): SignalBoostRepositoryRepairTarget | null {
  const objective = String(input || '').trim()
  const commitSha = String(deployment.commitSha || '').trim().toLowerCase()
  const branch = String(deployment.branch || 'main').trim()
  if (!objective || (!isExplicitPlatformRepairObjective(objective) && options.ownerDeveloperLogSubmission !== true)) return null
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
    missingModuleHints: unresolvedModulePaths(objective),
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
  const failingTests = paths.filter(path => /^(?:tests|test)\/.+\.test\.(?:ts|tsx|js|mjs|cjs|mts|cts)$/i.test(path))
  const command = target.failedCommand ? `Failed command: ${target.failedCommand}` : 'Failed command: not extracted from the log.'
  const narrowProof = failingTests.length
    ? `Narrow proof command: node --test ${failingTests.join(' ')}. Run this exact command from the mounted workspace root. Do not cd into another directory and do not use npm test -- <file>; this repository's npm test script enumerates the full suite.`
    : 'Commands already start in the mounted saas workspace root. Do not cd into guessed absolute paths; use workspace-relative paths and the narrowest relevant proof command.'
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
    // History is evidence. A missing property, a deleted import, or a signature that no longer
    // matches its callers is usually something a recent commit removed, and the current file
    // cannot show that. Reading the change is faster and more truthful than inferring intent.
    'The mounted repository carries recent history. When a failure is a contract, type, or missing-symbol mismatch, first run `git log --oneline -15 -- <file>` and `git show <sha> -- <file>` on the implicated file and read what the recent commits removed. If a commit deleted the property, import, or branch the failure names, restore it from `git show <sha>^:<file>` rather than writing a replacement from scratch. Report the commit you found. These git commands are read-only; committing, pushing, and merging remain forbidden.',
    narrowProof,
    'Do not weaken tests, access another repository, use the network, commit, push, merge, deploy, or claim success without fail-before/pass-after evidence.',
    command,
    paths.length ? `Path hints: ${paths.join(', ')}` : '',
    target.symbolHints.length ? `Symbol hints: ${target.symbolHints.join(', ')}` : '',
    // Stated as a completion condition, not a hint, because a module-not-found failure has no
    // failing test to reproduce: the only proof is that the file exists and imports cleanly.
    target.missingModuleHints.length
      ? `MISSING MODULES — the build could not resolve these imports, which means these files do not exist: ${target.missingModuleHints.join(', ')}. Create each one. Infer its required exports from every file that imports it and from any migration or schema it maps to; read those importers before writing. The repair is NOT complete while any of these paths is still absent, even if another proof command passes. Prove each with a command that actually imports it, for example \`node --experimental-strip-types -e "import('./<path>').then(()=>console.log('resolved'))"\`.`
      : '',
    `Failure evidence:\n${evidence}`,
  ].filter(Boolean).join('\n\n').slice(0, 7_900)
}
