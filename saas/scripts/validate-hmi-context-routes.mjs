// saas/scripts/validate-hmi-context-routes.mjs
//
// Build guard for HMI contextual workflow routing. It blocks global end-user
// review/approval destinations while allowing local module cards, drawers,
// and tabs.

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const root = process.cwd()
const appDir = path.join(root, 'app')

const blockedRouteSegments = new Set([
  'approvals',
  'approval-center',
  'global-approvals',
  'review-center',
  'global-review-center',
])

const blockedHrefPatterns = [
  /href\s*=\s*["']\/approvals(?:\/|["'#?])/i,
  /href\s*=\s*["']\/approval-center(?:\/|["'#?])/i,
  /href\s*=\s*["']\/global-approvals(?:\/|["'#?])/i,
  /href\s*=\s*["']\/review-center(?:\/|["'#?])/i,
  /href\s*=\s*["']\/global-review-center(?:\/|["'#?])/i,
]

const allowedExtensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs'])
const failures = []

function walk(dir) {
  if (!fs.existsSync(dir)) return []
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  return entries.flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return [full, ...walk(full)]
    return [full]
  })
}

for (const item of walk(appDir)) {
  const relative = path.relative(root, item).split(path.sep).join('/')
  const parts = relative.split('/')

  for (const part of parts) {
    if (blockedRouteSegments.has(part)) {
      failures.push(`${relative}: centralized review route segment '${part}' is not allowed. Keep the UI inside the originating module.`)
    }
  }

  if (!fs.existsSync(item) || !fs.statSync(item).isFile()) continue
  if (!allowedExtensions.has(path.extname(item))) continue

  const source = fs.readFileSync(item, 'utf8')
  for (const pattern of blockedHrefPatterns) {
    if (pattern.test(source)) {
      failures.push(`${relative}: links to a centralized review route. Use a local module tab, drawer, or card instead.`)
    }
  }
}

if (failures.length) {
  console.error('\nHMI contextual workflow validation failed:\n')
  for (const failure of failures) console.error(`- ${failure}`)
  console.error('\nReview actions must stay inside the relevant module context.\n')
  process.exit(1)
}

console.log('HMI contextual workflow validation passed.')
