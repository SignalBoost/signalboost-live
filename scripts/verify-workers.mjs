#!/usr/bin/env node
// scripts/verify-workers.mjs
//
// Integrity guard for the COSA pipeline's non-route files: worker scripts
// (scripts/*.mjs, saas/scripts/*.mjs) and GitHub Actions workflows
// (.github/workflows/*.yml). Companion to verify-route-handlers.mjs, which
// covers routes/pages but not these.
//
// Built after three production incidents in one week where whole-file content
// was committed to the wrong path (a workflow YAML pasted over
// brand-overlay-worker.mjs; video.ts pasted over cos-video-production-worker.mjs),
// silently killing all video rendering. Every one of those would have failed
// this guard within seconds.
//
// Checks, each with a named diagnosis so the log says exactly what happened:
//   1. SYNTAX     — every .mjs/.js worker must parse (`node --check`).
//   2. WRONG-KIND — a .mjs containing TypeScript or YAML; a workflow .yml
//                   containing JavaScript.
//   3. HEADER-PATH — if a file's first comment states its own repo path
//                   (convention: "// scripts/foo.mjs"), it must match the
//                   file's actual location. A mismatch = pasted to wrong path.
//   4. DUPLICATE  — identical content at two paths with different basenames
//                   means one of them is a misfile.
//
// Zero dependencies. Exit non-zero on any violation.

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { createHash } from 'node:crypto'

const WORKER_DIRS = ['scripts', 'saas/scripts']
const WORKFLOW_DIR = '.github/workflows'
const violations = []

function fail(file, kind, message) {
  violations.push({ file, kind, message })
}

function listFiles(dir, exts) {
  let entries = []
  try { entries = readdirSync(dir) } catch { return [] }
  const out = []
  for (const entry of entries) {
    const full = join(dir, entry)
    let st
    try { st = statSync(full) } catch { continue }
    if (st.isFile() && exts.some(ext => entry.endsWith(ext))) out.push(full)
  }
  return out
}

function firstCodeLine(text) {
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    if (trimmed.startsWith('//') || trimmed.startsWith('#') || trimmed.startsWith('/*') || trimmed.startsWith('*')) continue
    return trimmed
  }
  return ''
}

// ---- Check 1 + 2: workers ---------------------------------------------------
const workerFiles = WORKER_DIRS.flatMap(dir => listFiles(dir, ['.mjs', '.js']))
for (const file of workerFiles) {
  const text = readFileSync(file, 'utf8')

  // WRONG-KIND diagnosis first (clearer message than a raw SyntaxError).
  const code = firstCodeLine(text)
  if (/^(name|on|jobs|permissions|concurrency):\s*/.test(code)) {
    fail(file, 'WRONG-KIND', `This .mjs file contains a YAML workflow (first statement: "${code.slice(0, 40)}"). A GitHub Actions .yml was pasted here. Restore the JavaScript worker; the YAML belongs in ${WORKFLOW_DIR}/.`)
    continue
  }
  // Match TypeScript syntax only when it is actual code at the start of a line.
  // Worker integrity scripts legitimately inspect TypeScript source and may keep
  // strings such as "import X from '@/...'"; those strings are not TS imports.
  const hasTypeDeclaration = /^\s*(export\s+)?(type|interface)\s+\w+/m.test(text)
  const hasTypeOnlyImport = /^\s*import\s+type\s/m.test(text)
  const hasAliasImport = /^\s*import\s+(?:[^'"\n]*?\s+from\s+)?['"]@\//m.test(text)
  if (hasTypeDeclaration || hasTypeOnlyImport || hasAliasImport) {
    fail(file, 'WRONG-KIND', `This .mjs file contains TypeScript (type/interface declarations or "@/" path-alias imports). A .ts file was pasted here. Plain Node cannot run this — every scheduled run dies instantly. Restore the JavaScript worker.`)
    continue
  }

  // SYNTAX: must parse as plain Node ESM.
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' })
  } catch (err) {
    const detail = String(err?.stderr || err?.message || '').split('\n').slice(0, 4).join(' | ')
    fail(file, 'SYNTAX', `Not valid JavaScript — node --check failed: ${detail}`)
  }
}

// ---- Check 2b: workflows must be YAML, not JS -------------------------------
for (const file of listFiles(WORKFLOW_DIR, ['.yml', '.yaml'])) {
  const text = readFileSync(file, 'utf8')
  const code = firstCodeLine(text)
  if (/^(import|export|const|let|function|async)\b/.test(code) || /=>\s*{/.test(text.slice(0, 2000))) {
    fail(file, 'WRONG-KIND', `This workflow file contains JavaScript (first statement: "${code.slice(0, 40)}"). A worker script was pasted here. Restore the YAML workflow.`)
  }
}

// ---- Check 3: header path must match actual path ----------------------------
// Convention: pipeline files begin with a comment stating their own repo path,
// e.g. "// scripts/brand-overlay-worker.mjs". If present, it must match.
const HEADER_SCOPES = [
  ...workerFiles,
  ...listFiles('saas/lib/operator', ['.ts']),
  ...listFiles('saas/lib/cos', ['.ts']),
]
for (const file of HEADER_SCOPES) {
  let text
  try { text = readFileSync(file, 'utf8') } catch { continue }
  const headLines = text.split('\n').slice(0, 5)
  for (const line of headLines) {
    const m = line.match(/^(?:\/\/|#)\s*([\w./-]+\.(?:mjs|js|ts|tsx|yml))\s*$/)
    if (!m) continue
    const declared = m[1].replace(/^\.\//, '')
    const actual = file.replace(/\\/g, '/')
    if (declared !== actual && !actual.endsWith('/' + declared)) {
      fail(file, 'HEADER-PATH', `File header declares it is "${declared}" but it lives at "${actual}". Whole-file content was committed to the wrong path. Move/restore accordingly.`)
    }
    break
  }
}

// ---- Check 4: duplicate content at different basenames -----------------------
const hashes = new Map()
for (const file of [...workerFiles, ...listFiles(WORKFLOW_DIR, ['.yml', '.yaml'])]) {
  let text
  try { text = readFileSync(file, 'utf8') } catch { continue }
  const digest = createHash('sha256').update(text.replace(/\s+/g, ' ').trim()).digest('hex')
  const seen = hashes.get(digest)
  if (seen) {
    const base = p => p.split('/').pop()
    if (base(seen) !== base(file)) {
      fail(file, 'DUPLICATE', `Identical content to "${seen}" but with a different filename — one of the two is a misfile.`)
    }
  } else {
    hashes.set(digest, file)
  }
}

// ---- Report ------------------------------------------------------------------
if (violations.length) {
  console.error(`\nverify-workers: ${violations.length} violation(s) found\n`)
  for (const v of violations) {
    console.error(`  [${v.kind}] ${v.file}\n    ${v.message}\n`)
    // GitHub Actions annotation — shows on the commit/PR itself.
    console.log(`::error file=${v.file}::[${v.kind}] ${v.message}`)
  }
  process.exit(1)
}
console.log(`verify-workers: OK — ${workerFiles.length} worker script(s) and workflow files verified.`)
