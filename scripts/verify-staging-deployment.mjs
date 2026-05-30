import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const stagingPage = 'app/staging/page.tsx'
const packageFile = 'package.json'
const requiredPhrases = [
  'Staging deployment',
  'temporary SaaS validation only',
  'signalboost-live route is intentionally limited to staging, QA, and experimental deployments',
  '/dashboard/promote',
  '/dashboard/reviews',
  '/dashboard/calendar',
  '/dashboard/spreadsheets',
  '/dashboard/outreach',
  '/dashboard/assistant',
]

const failures = []

function readProjectFile(path) {
  const fullPath = resolve(repoRoot, path)
  if (!existsSync(fullPath)) {
    failures.push(`${path} is missing`)
    return ''
  }
  return readFileSync(fullPath, 'utf8')
}

const pageText = readProjectFile(stagingPage)
for (const phrase of requiredPhrases) {
  if (!pageText.includes(phrase)) {
    failures.push(`${stagingPage} must include "${phrase}"`)
  }
}

const packageText = readProjectFile(packageFile)
const packageJson = packageText ? JSON.parse(packageText) : { scripts: {} }
if (packageJson.scripts?.['qa:repo'] !== 'node scripts/verify-repo-targeting.mjs') {
  failures.push('package.json must keep qa:repo wired to repo targeting validation')
}
if (packageJson.scripts?.['qa:staging'] !== 'node scripts/verify-staging-deployment.mjs') {
  failures.push('package.json must expose qa:staging for staging deployment validation')
}

if (failures.length > 0) {
  console.error('Staging deployment QA failed:')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log('Staging deployment QA passed.')
