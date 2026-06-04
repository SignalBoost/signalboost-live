import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname, relative, resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const args = new Map()
for (let index = 2; index < process.argv.length; index += 1) {
  const arg = process.argv[index]
  if (!arg.startsWith('--')) continue
  const key = arg.slice(2)
  const next = process.argv[index + 1]
  if (next && !next.startsWith('--')) {
    args.set(key, next)
    index += 1
  } else {
    args.set(key, 'true')
  }
}

const productionTarget = { repo: 'SignalBoost', branch: 'main' }

const productionModules = [
  { label: 'Promote Business', files: ['app/dashboard/promote/page.tsx'] },
  { label: 'Reviews', files: ['app/dashboard/reviews/page.tsx'] },
  { label: 'Calendar', files: ['app/dashboard/calendar/page.tsx'] },
  { label: 'Spreadsheets', files: ['app/dashboard/spreadsheets/page.tsx'] },
  { label: 'Outreach', files: ['app/dashboard/outreach/page.tsx'] },
  { label: 'Personal Assistant', files: ['app/dashboard/assistant/page.tsx'] },
]

const productionAreas = [
  ...productionModules.map((module) => ({ ...module, type: 'SaaS module' })),
  { label: 'Global navbar', type: 'Navigation', files: ['app/layout.tsx', 'saas/components/Navbar.tsx', 'saas/components/Header.tsx', 'components/i18n/LanguageSwitcher.tsx'] },
  { label: 'Pricing page', type: 'Pricing', files: ['app/pricing/page.tsx'] },
  { label: 'Admin Console telemetry', type: 'Admin telemetry', files: ['app/api/admin/telemetry/route.ts', 'lib/admin/saasTelemetry.ts', 'app/admin/page.tsx'] },
  { label: 'Executive Dashboard', type: 'Dashboard', files: ['app/dashboard/page.tsx', 'components/dashboard/CockpitModulePage.tsx'] },
  { label: 'i18n translations', type: 'Localization', files: ['components/i18n/I18nProvider.tsx', 'lib/i18n/useTranslation.ts', 'lib/i18n/loadLanguage.ts', 'lib/i18n/detectLanguage.ts', 'saas/public/i18n/en.json'] },
  { label: 'Concierge AI integration', type: 'Concierge', files: ['app/api/concierge/route.ts', 'lib/concierge/unifiedConcierge.ts', 'saas/components/Concierge.tsx'] },
]

const conflictMarkerPattern = /^(<<<<<<<|=======|>>>>>>>)(?:\s|$)/m
const ignoredPathPattern = /(^|\/)(\.git|\.next|node_modules|dist|build|coverage)(\/|$)/

function runGit(args, fallback = '') {
  try {
    return execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    return fallback
  }
}

function parseRepoName(value = '') {
  const trimmed = String(value).trim()
  if (!trimmed) return ''
  const cleaned = trimmed.replace(/\.git$/, '').replace(/\/$/, '')
  return cleaned.split(/[/:]/).pop() ?? ''
}

function getRepoName() {
  if (process.env.QA_REPO_NAME) return process.env.QA_REPO_NAME
  if (process.env.GITHUB_REPOSITORY) return parseRepoName(process.env.GITHUB_REPOSITORY)

  const remote = runGit(['config', '--get', 'remote.origin.url'])
  const remoteName = parseRepoName(remote)
  if (remoteName) return remoteName

  return basename(repoRoot)
}

function getRepoKind(repoName) {
  const normalized = repoName.toLowerCase()
  if (normalized === 'signalboost') return 'production'
  if (normalized === 'signalboost-live') return 'staging'
  return 'unknown'
}

function readGitHubEvent() {
  if (!process.env.GITHUB_EVENT_PATH || !existsSync(process.env.GITHUB_EVENT_PATH)) return {}
  try {
    return JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'))
  } catch {
    return {}
  }
}

function getPullRequestTarget(event) {
  const explicitTarget = process.env.QA_TARGET_REPOSITORY || args.get('target-repository')
  const explicitBaseBranch = process.env.QA_BASE_BRANCH || args.get('base-branch')

  const targetRepository = parseRepoName(explicitTarget)
    || parseRepoName(event.pull_request?.base?.repo?.full_name)
    || parseRepoName(event.pull_request?.base?.repo?.name)
    || parseRepoName(event.repository?.full_name)
    || getRepoName()

  const baseBranch = explicitBaseBranch
    || event.pull_request?.base?.ref
    || process.env.GITHUB_BASE_REF
    || runGit(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}'], '').split('/').pop()
    || runGit(['branch', '--show-current'], '')

  return { targetRepository, baseBranch }
}

function isProductionTarget(target) {
  return getRepoKind(target.targetRepository) === 'production' && target.baseBranch === productionTarget.branch
}

function hasExplicitStagingApproval() {
  if (/^(1|true|yes)$/i.test(process.env.QA_EXPLICIT_STAGING_DEPLOYMENT ?? '')) return true

  const event = readGitHubEvent()
  const text = [event.pull_request?.title, event.pull_request?.body, event.head_commit?.message]
    .filter(Boolean)
    .join('\n')
    .toLowerCase()
  const labels = (event.pull_request?.labels ?? []).map((label) => String(label.name ?? '').toLowerCase())

  return text.includes('use signalboost-live')
    || text.includes('staging deployment')
    || labels.includes('staging-approved')
    || labels.includes('signalboost-live')
}

function getChangedFiles() {
  if (process.env.QA_CHANGED_FILES) {
    return process.env.QA_CHANGED_FILES.split(/\r?\n|,/).map((file) => file.trim()).filter(Boolean)
  }

  const changedFileList = args.get('changed-file-list')
  if (changedFileList && existsSync(changedFileList)) {
    return readFileSync(changedFileList, 'utf8').split(/\r?\n/).map((file) => file.trim()).filter(Boolean)
  }

  const base = args.get('base') || process.env.QA_BASE_REF
  const head = args.get('head') || process.env.QA_HEAD_REF || 'HEAD'
  if (base) {
    const diff = runGit(['diff', '--name-only', `${base}...${head}`]) || runGit(['diff', '--name-only', `${base}`, head])
    if (diff) return diff.split('\n').filter(Boolean)
  }

  const stagedDiff = runGit(['diff', '--name-only', '--cached'])
  const workingTreeDiff = runGit(['diff', '--name-only'])
  const untrackedFiles = runGit(['ls-files', '--others', '--exclude-standard'])
  const localChanges = [stagedDiff, workingTreeDiff, untrackedFiles]
    .flatMap((output) => output.split('\n').filter(Boolean))
  if (localChanges.length > 0) return [...new Set(localChanges)]

  const previousCommitDiff = runGit(['diff', '--name-only', 'HEAD~1..HEAD'])
  if (previousCommitDiff) return previousCommitDiff.split('\n').filter(Boolean)

  return []
}

function fileExists(filePath) {
  return existsSync(resolve(repoRoot, filePath))
}

function areaExists(area) {
  return area.files.some(fileExists)
}

function matchesProductionArea(filePath, area) {
  return area.files.some((areaFile) => filePath === areaFile || filePath.startsWith(`${areaFile}/`) || areaFile.startsWith(`${filePath}/`))
}

function findChangedProductionAreas(changedFiles) {
  return productionAreas.filter((area) => changedFiles.some((file) => matchesProductionArea(file, area)))
}

function scanConflictMarkers() {
  const trackedFiles = runGit(['ls-files', '-z']).split('\0').filter(Boolean)
  const filesWithMarkers = []

  for (const file of trackedFiles) {
    if (ignoredPathPattern.test(file)) continue
    const absolutePath = resolve(repoRoot, file)
    let buffer
    try {
      buffer = readFileSync(absolutePath)
    } catch {
      continue
    }
    if (buffer.includes(0)) continue
    const content = buffer.toString('utf8')
    if (conflictMarkerPattern.test(content)) filesWithMarkers.push(file)
  }

  return filesWithMarkers
}


function getTrackedTextFiles() {
  return runGit(['ls-files', '-z'])
    .split('\0')
    .filter(Boolean)
    .filter((file) => !ignoredPathPattern.test(file))
    .filter((file) => /\.(?:[cm]?[jt]sx?|json|css|md|html|mjs)$/.test(file))
}

function readTextFile(file) {
  const absolutePath = resolve(repoRoot, file)
  try {
    const buffer = readFileSync(absolutePath)
    if (buffer.includes(0)) return ''
    return buffer.toString('utf8')
  } catch {
    return ''
  }
}

function scanDuplicateComponentDefinitions() {
  const duplicates = []
  const declarationPattern = /(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+([A-Z][A-Za-z0-9_]*)\s*\(|(?:export\s+)?const\s+([A-Z][A-Za-z0-9_]*)\s*=|(?:export\s+)?class\s+([A-Z][A-Za-z0-9_]*)\s+/g
  const candidateFiles = getTrackedTextFiles().filter((file) => /\.(?:[jt]sx?)$/.test(file))

  for (const file of candidateFiles) {
    const content = readTextFile(file)
    if (!content) continue

    const seen = new Map()
    for (const match of content.matchAll(declarationPattern)) {
      const name = match[1] || match[2] || match[3]
      const beforeMatch = content.slice(0, match.index)
      const line = beforeMatch.split('\n').length
      const existing = seen.get(name)
      if (existing) {
        duplicates.push(`${file}: ${name} declared on lines ${existing} and ${line}`)
      } else {
        seen.set(name, line)
      }
    }
  }

  return duplicates
}

function normalizeRoutePath(file) {
  const withoutApp = file.replace(/^app\//, '').replace(/\/(page|route)\.(?:[jt]sx?)$/, '')
  const segments = withoutApp
    .split('/')
    .filter(Boolean)
    .filter((segment) => !/^\(.+\)$/.test(segment))
    .filter((segment) => !segment.startsWith('@'))
    .map((segment) => segment.replace(/^\[\.\.\.(.+)\]$/, ':$1*').replace(/^\[(.+)\]$/, ':$1'))

  return `/${segments.join('/')}`.replace(/\/$/, '') || '/'
}

function scanConflictingRoutes() {
  const filesByRoute = new Map()
  const routeFiles = runGit(['ls-files', 'app/**/page.tsx', 'app/**/page.ts', 'app/**/route.ts', 'app/**/route.tsx'])
    .split('\n')
    .filter(Boolean)

  for (const file of routeFiles) {
    const kind = file.includes('/route.') ? 'api' : 'page'
    const route = `${kind}:${normalizeRoutePath(file)}`
    const existing = filesByRoute.get(route) ?? []
    existing.push(file)
    filesByRoute.set(route, existing)
  }

  return [...filesByRoute.entries()]
    .filter(([, files]) => files.length > 1)
    .map(([route, files]) => `${route} -> ${files.join(', ')}`)
}

function scanDuplicateApiMethods() {
  const duplicates = []
  const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']
  const routeFiles = runGit(['ls-files', 'app/**/route.ts', 'app/**/route.tsx'])
    .split('\n')
    .filter(Boolean)

  for (const file of routeFiles) {
    const content = readTextFile(file)
    if (!content) continue

    for (const method of methods) {
      const methodPattern = new RegExp(`export\\s+(?:async\\s+)?function\\s+${method}\\s*\\(|export\\s+const\\s+${method}\\s*=`, 'g')
      const matches = [...content.matchAll(methodPattern)]
      if (matches.length > 1) duplicates.push(`${file}: ${method} handler exported ${matches.length} times`)
    }
  }

  return duplicates
}

function statusIcon(ok) {
  return ok ? '✅' : '❌'
}

const event = readGitHubEvent()
const repoName = getRepoName()
const repoKind = getRepoKind(repoName)
const pullRequestTarget = getPullRequestTarget(event)
const targetKind = getRepoKind(pullRequestTarget.targetRepository)
const changedFiles = getChangedFiles()
const explicitStagingApproval = hasExplicitStagingApproval()
const deployedProductionAreas = productionAreas.filter(areaExists)
const deployedModules = productionModules.filter(areaExists)
const changedProductionAreas = findChangedProductionAreas(changedFiles)
const filesWithConflictMarkers = scanConflictMarkers()
const duplicateComponentDefinitions = scanDuplicateComponentDefinitions()
const conflictingRoutes = scanConflictingRoutes()
const duplicateApiMethods = scanDuplicateApiMethods()
const failures = []

const targetIsProductionMain = isProductionTarget(pullRequestTarget)

if (repoKind === 'production') {
  const missingRequiredAreas = productionAreas.filter((area) => !areaExists(area))
  if (missingRequiredAreas.length > 0) {
    failures.push(`Production repo is missing required areas: ${missingRequiredAreas.map((area) => area.label).join(', ')}`)
  }
} else if (repoKind !== 'staging') {
  failures.push(`Unknown repository target "${repoName}". Expected SignalBoost or signalboost-live.`)
}

if (changedProductionAreas.length > 0 && !targetIsProductionMain) {
  if (repoKind === 'staging' && explicitStagingApproval) {
    // Explicitly approved staging-only experiments are allowed to remain in signalboost-live.
  } else {
    failures.push(`Production-scope files changed, so the PR base must be ${productionTarget.repo}/${productionTarget.branch}; detected ${pullRequestTarget.targetRepository}:${pullRequestTarget.baseBranch || 'unknown'}.`)
  }
}

if (targetKind === 'production' && pullRequestTarget.baseBranch !== productionTarget.branch) {
  failures.push(`Production PRs must target ${productionTarget.repo}/${productionTarget.branch}; detected ${pullRequestTarget.targetRepository}:${pullRequestTarget.baseBranch || 'unknown'}.`)
}

if (filesWithConflictMarkers.length > 0) {
  failures.push(`Conflict markers remain in: ${filesWithConflictMarkers.join(', ')}`)
}

if (duplicateComponentDefinitions.length > 0) {
  failures.push(`Duplicate component definitions found: ${duplicateComponentDefinitions.join('; ')}`)
}

if (conflictingRoutes.length > 0) {
  failures.push(`Conflicting Next.js route names found: ${conflictingRoutes.join('; ')}`)
}

if (duplicateApiMethods.length > 0) {
  failures.push(`Conflicting API handler names found: ${duplicateApiMethods.join('; ')}`)
}

const reportLines = [
  '# SignalBoost Repo Targeting QA Report',
  '',
  `- **Repository:** ${repoName}`,
  `- **Detected source repository:** ${repoName} (${repoKind})`,
  `- **PR base target:** ${pullRequestTarget.targetRepository}:${pullRequestTarget.baseBranch || 'unknown'} (${targetKind})`,
  `- **Required production target:** ${productionTarget.repo}/${productionTarget.branch}`,
  `- **Explicit staging approval:** ${explicitStagingApproval ? 'yes' : 'no'}`,
  `- **Changed files scanned:** ${changedFiles.length}`,
  `- **Result:** ${failures.length === 0 ? 'PASS' : 'FAIL'}`,
  '',
  '## Repo targeting compliance',
  '',
]

if (targetIsProductionMain) {
  reportLines.push('✅ Production-scope PR target is SignalBoost/main.')
} else {
  reportLines.push('❌ Production-scope PR target is not SignalBoost/main.')
}

if (repoKind === 'production') {
  reportLines.push(`${statusIcon(failures.length === 0)} Production areas were verified in the SignalBoost repo.`)
} else if (repoKind === 'staging') {
  const noMisdeployments = changedProductionAreas.length === 0 || explicitStagingApproval || targetIsProductionMain
  reportLines.push(`${statusIcon(noMisdeployments)} signalboost-live is treated as staging-only; production-scope changes require a SignalBoost/main PR base unless explicitly approved for staging.`)
  if (changedProductionAreas.length > 0) {
    reportLines.push(`- Production-scope areas touched by this PR: ${changedProductionAreas.map((area) => area.label).join(', ')}`)
  } else {
    reportLines.push('- No production-scope areas were touched by this PR.')
  }
} else {
  reportLines.push('❌ Unable to map this repository to SignalBoost production or signalboost-live staging.')
}

reportLines.push('', '## Modules deployed', '')
for (const module of productionModules) {
  reportLines.push(`- ${areaExists(module) ? '✅' : '❌'} ${module.label}: ${module.files.filter(fileExists).join(', ') || 'missing'}`)
}

reportLines.push('', '## Correct repo placement', '')
for (const area of productionAreas) {
  const placement = repoKind === 'production'
    ? (areaExists(area) ? 'present in production repo' : 'missing from production repo')
    : (changedProductionAreas.includes(area) ? 'changed in staging PR' : 'not changed in staging PR')
  reportLines.push(`- **${area.label}** (${area.type}): ${placement}`)
}

reportLines.push('', '## Conflict resolution summary', '')
if (filesWithConflictMarkers.length === 0) {
  reportLines.push('✅ No merge conflict markers were found in tracked text files.')
} else {
  reportLines.push('❌ Merge conflict markers remain:')
  for (const file of filesWithConflictMarkers) reportLines.push(`- ${file}`)
}

if (duplicateComponentDefinitions.length === 0) {
  reportLines.push('✅ No duplicate component definitions were found within tracked TypeScript modules.')
} else {
  reportLines.push('❌ Duplicate component definitions remain:')
  for (const duplicate of duplicateComponentDefinitions) reportLines.push(`- ${duplicate}`)
}

if (conflictingRoutes.length === 0) {
  reportLines.push('✅ No conflicting Next.js page or API route names were found.')
} else {
  reportLines.push('❌ Conflicting Next.js routes remain:')
  for (const route of conflictingRoutes) reportLines.push(`- ${route}`)
}

if (duplicateApiMethods.length === 0) {
  reportLines.push('✅ No duplicate API method exports were found in route handlers.')
} else {
  reportLines.push('❌ Duplicate API method exports remain:')
  for (const method of duplicateApiMethods) reportLines.push(`- ${method}`)
}

reportLines.push('', '## Compilation validation', '')
reportLines.push('Compilation is validated by the PR workflow after this repo-targeting check using the configured package scripts.')

if (failures.length > 0) {
  reportLines.push('', '## Failures', '')
  for (const failure of failures) reportLines.push(`- ${failure}`)
}

const reportPath = resolve(repoRoot, args.get('report') || process.env.QA_REPORT_PATH || 'qa/repo-targeting-report.md')
mkdirSync(dirname(reportPath), { recursive: true })
writeFileSync(reportPath, `${reportLines.join('\n')}\n`)

console.log(reportLines.join('\n'))
console.log(`\nQA report written to ${relative(repoRoot, reportPath)}`)

if (process.env.GITHUB_STEP_SUMMARY) {
  writeFileSync(process.env.GITHUB_STEP_SUMMARY, `${reportLines.join('\n')}\n`, { flag: 'a' })
}

if (failures.length > 0) {
  process.exitCode = 1
}
