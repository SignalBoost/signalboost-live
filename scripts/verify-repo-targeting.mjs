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

function getRepoName() {
  if (process.env.QA_REPO_NAME) return process.env.QA_REPO_NAME
  if (process.env.GITHUB_REPOSITORY) return process.env.GITHUB_REPOSITORY.split('/').pop()

  const remote = runGit(['config', '--get', 'remote.origin.url'])
  if (remote) {
    const cleaned = remote.replace(/\.git$/, '').replace(/\/$/, '')
    const remoteName = cleaned.split(/[/:]/).pop()
    if (remoteName) return remoteName
  }

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

function statusIcon(ok) {
  return ok ? '✅' : '❌'
}

const repoName = getRepoName()
const repoKind = getRepoKind(repoName)
const changedFiles = getChangedFiles()
const explicitStagingApproval = hasExplicitStagingApproval()
const deployedProductionAreas = productionAreas.filter(areaExists)
const deployedModules = productionModules.filter(areaExists)
const changedProductionAreas = findChangedProductionAreas(changedFiles)
const filesWithConflictMarkers = scanConflictMarkers()
const failures = []

if (repoKind === 'production') {
  const missingRequiredAreas = productionAreas.filter((area) => !areaExists(area))
  if (missingRequiredAreas.length > 0) {
    failures.push(`Production repo is missing required areas: ${missingRequiredAreas.map((area) => area.label).join(', ')}`)
  }
} else if (repoKind === 'staging') {
  if (changedProductionAreas.length > 0 && !explicitStagingApproval) {
    failures.push(`Production-scope files changed in signalboost-live without explicit staging approval: ${changedProductionAreas.map((area) => area.label).join(', ')}`)
  }
} else {
  failures.push(`Unknown repository target "${repoName}". Expected SignalBoost or signalboost-live.`)
}

if (filesWithConflictMarkers.length > 0) {
  failures.push(`Conflict markers remain in: ${filesWithConflictMarkers.join(', ')}`)
}

const reportLines = [
  '# SignalBoost Repo Targeting QA Report',
  '',
  `- **Repository:** ${repoName}`,
  `- **Detected target:** ${repoKind}`,
  `- **Explicit staging approval:** ${explicitStagingApproval ? 'yes' : 'no'}`,
  `- **Changed files scanned:** ${changedFiles.length}`,
  `- **Result:** ${failures.length === 0 ? 'PASS' : 'FAIL'}`,
  '',
  '## Repo targeting compliance',
  '',
]

if (repoKind === 'production') {
  reportLines.push(`${statusIcon(failures.length === 0)} Production areas were verified in the SignalBoost repo.`)
} else if (repoKind === 'staging') {
  const noMisdeployments = changedProductionAreas.length === 0 || explicitStagingApproval
  reportLines.push(`${statusIcon(noMisdeployments)} signalboost-live is treated as staging-only; production-scope changes require explicit approval.`)
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
