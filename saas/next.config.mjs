// saas/next.config.mjs
// Canonical Next.js configuration. Keep one config file so Vercel, local builds,
// COS integrity checks, and output-file tracing all evaluate the same policy.

import fs from 'node:fs'
import path from 'node:path'

const appDir = path.join(process.cwd(), 'app')
const blockedSegments = new Set(['approvals', 'approval-center', 'global-approvals', 'review-center', 'global-review-center'])
const blockedLinks = [
  /href\s*=\s*["']\/approvals(?:\/|["'#?])/i,
  /href\s*=\s*["']\/approval-center(?:\/|["'#?])/i,
  /href\s*=\s*["']\/global-approvals(?:\/|["'#?])/i,
  /href\s*=\s*["']\/review-center(?:\/|["'#?])/i,
  /href\s*=\s*["']\/global-review-center(?:\/|["'#?])/i,
]
const codeExt = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs'])

function walk(dir) {
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return [full, ...walk(full)]
    return [full]
  })
}

function validateContextualRoutes() {
  const failures = []
  for (const item of walk(appDir)) {
    const relative = path.relative(process.cwd(), item).split(path.sep).join('/')
    for (const part of relative.split('/')) {
      if (blockedSegments.has(part)) failures.push(relative + ': move this review route into its originating module area.')
    }
    if (!fs.existsSync(item) || !fs.statSync(item).isFile() || !codeExt.has(path.extname(item))) continue
    const source = fs.readFileSync(item, 'utf8')
    for (const pattern of blockedLinks) {
      if (pattern.test(source)) failures.push(relative + ': link points to a central review route; use a local drawer, tab, or card.')
    }
  }
  if (failures.length) {
    throw new Error('HMI contextual workflow validation failed:\n' + failures.map((failure) => '- ' + failure).join('\n'))
  }
}

validateContextualRoutes()

/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: {},
  // Vercel builds from `saas`, while the protected approved COS snapshot lives at
  // repository root. Expand the trace root only far enough to include that exact
  // governance snapshot, then bind it explicitly to the Concierge route.
  outputFileTracingRoot: path.join(process.cwd(), '..'),
  outputFileTracingIncludes: {
    '/api/concierge': ['../cos-core/brain.md'],
  },
}

export default nextConfig
