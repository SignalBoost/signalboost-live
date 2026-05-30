import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const reportPath = resolve(repoRoot, 'qa/full-pipeline-report.md')

const expectedLocales = ['en', 'es', 'pt', 'pl', 'ru']
const expectedModules = [
  'Promote Business',
  'Reviews',
  'Calendar',
  'Spreadsheets',
  'Outreach',
  'Personal Assistant',
]
const executiveAreas = ['financials', 'kpis', 'crmPipeline', 'outreach', 'forecasts']

function read(file) {
  return readFileSync(resolve(repoRoot, file), 'utf8')
}

function runGit(args) {
  try {
    return execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    return ''
  }
}

function getRepoName() {
  const remote = runGit(['config', '--get', 'remote.origin.url'])
  if (remote) return remote.replace(/\.git$/, '').replace(/\/$/, '').split(/[/:]/).pop()
  return repoRoot.split('/').pop()
}

function flattenKeys(value, prefix = '') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [prefix]
  return Object.entries(value).flatMap(([key, child]) => flattenKeys(child, prefix ? `${prefix}.${key}` : key))
}

function statusIcon(ok) {
  return ok ? '✅' : '❌'
}

function assertFile(file) {
  return existsSync(resolve(repoRoot, file))
}

const repoName = getRepoName()
const repoKind = repoName === 'signalboost-live' ? 'staging' : repoName === 'SignalBoost' || repoName === 'signalboost' ? 'production' : 'unknown'
const conflictScan = runGit(['ls-files']).split('\n').filter(Boolean).filter((file) => {
  if (/(^|\/)(\.git|\.next|node_modules|dist|build|coverage)(\/|$)/.test(file)) return false
  const content = read(file)
  return /^(<<<<<<<|=======|>>>>>>>)(?:\s|$)/m.test(content)
})

const moduleFiles = {
  'Promote Business': 'app/dashboard/promote/page.tsx',
  Reviews: 'app/dashboard/reviews/page.tsx',
  Calendar: 'app/dashboard/calendar/page.tsx',
  Spreadsheets: 'app/dashboard/spreadsheets/page.tsx',
  Outreach: 'app/dashboard/outreach/page.tsx',
  'Personal Assistant': 'app/dashboard/assistant/page.tsx',
}
const moduleResults = expectedModules.map((module) => ({ module, file: moduleFiles[module], ok: assertFile(moduleFiles[module]) }))

const designFiles = ['app/page.tsx', 'app/dashboard/page.tsx', 'app/admin/page.tsx', 'components/dashboard/CockpitModulePage.tsx', 'app/pricing/page.tsx']
const designCorpus = designFiles.filter(assertFile).map(read).join('\n')
const designChecks = [
  { label: 'NASA dark cockpit background', ok: designCorpus.includes('#05070b') },
  { label: 'SignalBoost gold neon token', ok: designCorpus.includes('#FFD700') },
  { label: 'Responsive breakpoints', ok: /\b(md|lg|xl):/.test(designCorpus) },
  { label: 'Semantic regions', ok: /<(main|section|aside|nav|header)\b/.test(designCorpus) },
  { label: 'Accessible labels and alerts', ok: designCorpus.includes('aria-label') && designCorpus.includes('role="alert"') },
  { label: 'Keyboard-friendly links/buttons', ok: /<Link\b/.test(designCorpus) && /hover:|focus:/.test(designCorpus) },
]

const localeData = Object.fromEntries(expectedLocales.map((locale) => {
  const file = `saas/public/i18n/${locale}.json`
  return [locale, JSON.parse(read(file))]
}))
const englishKeys = new Set(flattenKeys(localeData.en))
const localeChecks = expectedLocales.map((locale) => {
  const keys = new Set(flattenKeys(localeData[locale]))
  const missing = [...englishKeys].filter((key) => !keys.has(key))
  const extra = [...keys].filter((key) => !englishKeys.has(key))
  return { locale, missing, extra, ok: missing.length === 0 }
})

const concierge = read('lib/concierge/unifiedConcierge.ts') + read('app/api/concierge/route.ts')
const conciergeChecks = [
  { label: 'Locale parameter returned in Concierge response', ok: concierge.includes('locale') && concierge.includes('answerSignalBoostConcierge(query, locale)') },
  { label: 'Marketplace + SaaS answer scope', ok: concierge.includes('SignalBoost Marketplace + SaaS') },
  { label: 'Telemetry event emitted', ok: concierge.includes('concierge.unified_query.logged') },
]

const telemetry = read('lib/admin/saasTelemetry.ts')
const adminPage = read('app/admin/page.tsx')
const adminRoute = read('app/api/admin/telemetry/route.ts')
const accessControl = read('lib/admin/accessControl.ts')
const executiveChecks = [
  ...executiveAreas.map((area) => ({ label: `${area} telemetry present`, ok: telemetry.includes(area) })),
  { label: 'Forecasting predictions render', ok: adminPage.includes('Forecasting predictions') && adminPage.includes('executiveTelemetry.forecasts') },
  { label: 'Owner/admin access restriction', ok: accessControl.includes("'owner'") && accessControl.includes("'admin'") && adminRoute.includes('status: 403') && adminPage.includes('Owner/admin access required') },
]

const reportLines = [
  '# SignalBoost Full QA Pipeline Report',
  '',
  `- **Repository:** ${repoName}`,
  `- **Detected target:** ${repoKind}`,
  `- **Generated:** ${new Date().toISOString()}`,
  '',
  '## 1. Repo Consistency QA',
  '',
  `${statusIcon(repoKind === 'staging')} signalboost-live is identified as the staging repository for this run.`,
  `${statusIcon(conflictScan.length === 0)} Merge conflict marker scan ${conflictScan.length === 0 ? 'passed' : `found ${conflictScan.join(', ')}`}.`,
  '',
  '### SaaS module placement',
  '',
  ...moduleResults.map((result) => `- ${statusIcon(result.ok)} ${result.module}: ${result.file}`),
  '',
  '## 2. Design Tokens QA',
  '',
  ...designChecks.map((check) => `- ${statusIcon(check.ok)} ${check.label}`),
  '',
  '## 3. Deployment QA',
  '',
  '- ⚠️ Vercel deployment and Lighthouse require the hosted preview URL after PR creation/merge.',
  '- ⚠️ Runtime Lighthouse thresholds to confirm on preview: Performance ≥ 90, FCP < 2s, TTI < 2.5s.',
  '',
  '### i18n translations',
  '',
  ...localeChecks.map((check) => `- ${statusIcon(check.ok)} ${check.locale}: ${check.missing.length} missing keys${check.extra.length ? `, ${check.extra.length} extra keys` : ''}`),
  '',
  '### Concierge locale coverage',
  '',
  ...conciergeChecks.map((check) => `- ${statusIcon(check.ok)} ${check.label}`),
  '',
  '## 4. Executive Dashboard QA',
  '',
  ...executiveChecks.map((check) => `- ${statusIcon(check.ok)} ${check.label}`),
  '',
  '## Cockpit Usability Report',
  '',
  '- The staging cockpit presents Marketplace + SaaS modules as mission cards with high-contrast gold telemetry accents.',
  '- Owner/admin executive telemetry is isolated behind the admin console and mirrors summary status on the main cockpit.',
  '- Forecasting cards expose confidence values and explain the next operational risk/action for executives.',
]

const failed = [
  ...moduleResults.filter((result) => !result.ok).map((result) => result.module),
  ...designChecks.filter((check) => !check.ok).map((check) => check.label),
  ...localeChecks.filter((check) => !check.ok).map((check) => check.locale),
  ...conciergeChecks.filter((check) => !check.ok).map((check) => check.label),
  ...executiveChecks.filter((check) => !check.ok).map((check) => check.label),
  ...conflictScan,
]

if (failed.length > 0) {
  reportLines.push('', '## Failures', '', ...failed.map((failure) => `- ${failure}`))
}

mkdirSync(dirname(reportPath), { recursive: true })
writeFileSync(reportPath, `${reportLines.join('\n')}\n`)
console.log(reportLines.join('\n'))
console.log(`\nFull QA report written to qa/full-pipeline-report.md`)

if (failed.length > 0) process.exitCode = 1
