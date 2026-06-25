#!/usr/bin/env node
// scripts/verify-route-handlers.mjs
//
// Structural guard against the recurring "paste-into-wrong-path" corruption,
// where whole-file content lands in the wrong file under a misleading commit
// message (e.g. a React component pasted over an API route, or one component
// pasted over another). tsc/next build sometimes only fail downstream and the
// real cause is hard to spot. This check fails fast, at the corrupted file.
//
// Rules:
//   1. Every app/api/**/route.ts(x) must export at least one HTTP method
//      (GET/POST/PUT/PATCH/DELETE/HEAD/OPTIONS) and must NOT contain
//      'use client' or render JSX — a route handler is server-only.
//   2. No route.ts(x) may live outside an app/ directory (a route file under
//      components/ etc. is dead and usually a misfile).
//   3. Every page.tsx under app/ must have a default export.
//
// Scans both the root tree and the saas/ tree. Exit non-zero on any violation.
import { readFileSync } from 'node:fs'
import { readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
const ROOTS = ['app', 'saas/app', 'components', 'saas/components', 'scripts']
const HTTP = /export\s+(async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b|export\s+const\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s*=/
const USE_CLIENT = /^\s*['"]use client['"]/m
const DEFAULT_EXPORT = /export\s+default\b|export\s*\{[^}]*\bdefault\b[^}]*\}/
const JSX_HINT = /return\s*\(?\s*</
const violations = []
function walk(dir) {
  let entries
  try { entries = readdirSync(dir) } catch { return }
  for (const name of entries) {
    if (name === 'node_modules' || name.startsWith('.')) continue
    const full = join(dir, name)
    let st
    try { st = statSync(full) } catch { continue }
    if (st.isDirectory()) { walk(full); continue }
    if (!/\.(tsx?|jsx?|mjs|cjs)$/.test(name)) continue
    check(full)
  }
}
function check(file) {
  const rel = relative(process.cwd(), file)
  const base = file.split('/').pop()
  const inApi = /(^|\/)app\/api\//.test(rel)
  const src = readFileSync(file, 'utf8')
  // Rule 0: a plain Node script (scripts/**.mjs|cjs|js) must never contain
  // 'use client' — that's a React component pasted over a script (this is how
  // a guard/CI script itself got clobbered once).
  if (/(^|\/)scripts\//.test(rel) && /\.(mjs|cjs|js)$/.test(base) && USE_CLIENT.test(src)) {
    violations.push(`${rel}: Node script contains 'use client' (a component was pasted over a script)`)
    return
  }
  // Rule 2: route file outside an app/ dir.
  if (/^route\.(t|j)sx?$/.test(base) && !/(^|\/)app\//.test(rel)) {
    violations.push(`${rel}: route file lives outside an app/ directory (dead/misfiled route)`)
    return
  }
  // Rule 1: API route handler integrity.
  if (inApi && /^route\.(t|j)sx?$/.test(base)) {
    if (USE_CLIENT.test(src)) violations.push(`${rel}: API route contains 'use client' (a component was pasted over a route handler)`)
    if (!HTTP.test(src)) violations.push(`${rel}: API route exports no HTTP method handler (GET/POST/...)`)
    if (DEFAULT_EXPORT.test(src) && JSX_HINT.test(src)) violations.push(`${rel}: API route default-exports a component instead of HTTP handlers`)
    return
  }
  // Rule 3: app page must have a default export.
  if (/^page\.(t|j)sx?$/.test(base) && /(^|\/)app\//.test(rel)) {
    if (!DEFAULT_EXPORT.test(src)) violations.push(`${rel}: app page has no default export (content likely pasted from a non-page file)`)
  }
}
for (const r of ROOTS) walk(r)
if (violations.length) {
  console.error(`\n✗ verify-route-handlers: ${violations.length} structural violation(s):\n`)
  for (const v of violations) console.error('  - ' + v)
  console.error('\nThis usually means whole-file content was pasted into the wrong path.\n')
  process.exit(1)
}
console.log('✓ verify-route-handlers: all route handlers and pages are structurally sound')
