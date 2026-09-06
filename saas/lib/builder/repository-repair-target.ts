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
