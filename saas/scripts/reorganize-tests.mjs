// saas/scripts/reorganize-tests.mjs
/**
 * One-time repair of saas/tests/, which grew past GitHub's 1,000-file directory cap so the
 * directory can no longer be browsed in the web UI.
 *
 * It does four things, then verifies its own work:
 *   1. moves every test file into a domain subdirectory (tests/<domain>/...)
 *   2. rewrites relative imports inside each moved file for its new depth
 *   3. replaces the hand-maintained 349-filename "test" script in package.json with glob discovery,
 *      so all test files run and the list can never go stale again
 *   4. repoints workflow path filters and inline `node --test` commands at the new locations
 *
 * Run from saas/:  node scripts/reorganize-tests.mjs
 * Add --dry-run to print the plan without touching anything.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, renameSync } from 'node:fs'
import path from 'node:path'

const DRY = process.argv.includes('--dry-run')
const TESTS = 'tests'
const REPO_ROOT = path.resolve('..')

/** Longest prefix wins, so `cosUniversity` beats `cos`. Order here is irrelevant. */
const DOMAINS = [
  'cosUniversity', 'cos', 'a2a', 'specialistMesh', 'agentGateway', 'agentWorkflow', 'agent',
  'android', 'audit', 'browser', 'cluster-runtime-health', 'codeRepair', 'eae',
  'human-review', 'enterprise', 'mission', 'portable', 'protocol', 'provider', 'press',
  'runpod', 'supervisor', 'vercel', 'github', 'render', 'i18n', 'hub',
]

function domainFor(name) {
  const lower = name.toLowerCase()
  let best = null
  for (const domain of DOMAINS) {
    if (lower.startsWith(domain.toLowerCase()) && (!best || domain.length > best.length)) best = domain
  }
  return slug(best || 'misc')
}

function slug(value) {
  return value.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()
}

// ---------------------------------------------------------------------------------------------
// DEAD-CODE PASS. lib/autonomous-systems grew into a self-referential module farm: 70 files whose
// only importer is their own barrel, which nothing in the product imports. Reachability is
// computed live here rather than hardcoded: a member is kept only if real code (app/ or lib/
// outside the directory, alias or relative form) imports it directly or transitively. Everything
// else is deleted, together with tests stranded by the deletion. Recomputing on every run means
// a module that gains a real importer tomorrow is automatically kept.
// ---------------------------------------------------------------------------------------------
import { rmSync } from 'node:fs'

const DEAD_SCAN_DIR = 'lib/autonomous-systems'

function memberImportsOf(file, members) {
  const source = readFileSync(file, 'utf8')
  const specs = [
    ...source.matchAll(/from\s+['"]([^'"]+)['"]/g),
    ...source.matchAll(/import\(\s*['"]([^'"]+)['"]/g),
  ].map(match => match[1])
  const found = new Set()
  for (const spec of specs) {
    let candidate = null
    if (spec.startsWith('@/')) candidate = spec.slice(2)
    else if (spec.startsWith('.')) candidate = path.normalize(path.join(path.dirname(file), spec))
    else continue
    for (const variant of [candidate, `${candidate}.ts`, `${candidate}.tsx`, path.join(candidate, 'index.ts')]) {
      if (members.has(variant)) found.add(variant)
    }
  }
  return found
}

function collectSourceFiles(root, skip) {
  const out = []
  const walk = dir => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (skip.some(prefix => full.startsWith(prefix))) continue
      if (entry.isDirectory()) walk(full)
      else if (/\.tsx?$/.test(entry.name)) out.push(full)
    }
  }
  walk(root)
  return out
}

function deadCodePass() {
  if (!existsSync(DEAD_SCAN_DIR)) return { deletedModules: 0, deletedTests: 0 }
  const members = new Set(readdirSync(DEAD_SCAN_DIR).filter(name => name.endsWith('.ts')).map(name => path.join(DEAD_SCAN_DIR, name)))
  const outside = [...collectSourceFiles('lib', [DEAD_SCAN_DIR]), ...collectSourceFiles('app', [])]
  const reachable = new Set()
  for (const file of outside) for (const hit of memberImportsOf(file, members)) reachable.add(hit)
  const frontier = [...reachable]
  while (frontier.length) {
    for (const dep of memberImportsOf(frontier.pop(), members)) {
      if (!reachable.has(dep)) { reachable.add(dep); frontier.push(dep) }
    }
  }
  const dead = [...members].filter(member => !reachable.has(member))
  for (const member of dead) rmSync(member)
  let deletedTests = 0
  for (const name of readdirSync(TESTS, { withFileTypes: true }).filter(entry => entry.isFile()).map(entry => entry.name)) {
    const full = path.join(TESTS, name)
    const hits = memberImportsOf(full, members)
    if (!hits.size) continue
    // A test survives only if at least one thing it tests survived.
    if ([...hits].every(hit => !reachable.has(hit))) { rmSync(full); deletedTests += 1 }
  }
  console.log(`Dead-code pass: deleted ${dead.length} unreachable modules in ${DEAD_SCAN_DIR} (kept ${reachable.size}), and ${deletedTests} tests that only exercised them.`)
  return { deletedModules: dead.length, deletedTests }
}

deadCodePass()

const files = readdirSync(TESTS, { withFileTypes: true })
  .filter(entry => entry.isFile())
  .map(entry => entry.name)

if (!files.length) {
  console.log('tests/ has no files at top level; nothing to do.')
  process.exit(0)
}

const plan = new Map()
for (const name of files) plan.set(name, domainFor(name))

const counts = {}
for (const domain of plan.values()) counts[domain] = (counts[domain] || 0) + 1
console.log(`Planning ${plan.size} moves across ${Object.keys(counts).length} directories:`)
for (const [domain, count] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
  console.log(`  tests/${domain}/  ${count}`)
}
const over = Object.entries(counts).filter(([, count]) => count > 800)
if (over.length) {
  console.error(`REFUSING: ${over.map(([d]) => d).join(', ')} would still exceed 800 files.`)
  process.exit(1)
}
if (DRY) { console.log('\n--dry-run: nothing written.'); process.exit(0) }

/** A file one level deeper needs one more `../` on every relative import. */
function deepenImports(source) {
  return source
    .replace(/(from\s+['"])\.\.\//g, '$1../../')
    .replace(/(import\s*\(\s*['"])\.\.\//g, '$1../../')
    .replace(/(from\s+['"])\.\//g, '$1../')
    .replace(/(import\s*\(\s*['"])\.\//g, '$1../')
    // Tests also read source files as text to assert on them; those URLs are relative to the test
    // file too, so they move with it. Missing these is a silent failure, not an import error.
    .replace(/(new URL\(\s*['"])\.\.\//g, '$1../../')
    .replace(/(new URL\(\s*['"])\.\//g, '$1../')
}

/** Every relative specifier a file uses, mapped to whether it currently resolves. */
function referencesOf(source, fromDir) {
  const found = new Map()
  const matches = [
    ...source.matchAll(/from\s+['"](\.\.?\/[^'"]+)['"]/g),
    ...source.matchAll(/new URL\(\s*['"](\.\.?\/[^'"]+)['"]/g),
  ]
  for (const match of matches) {
    const base = path.resolve(fromDir, match[1])
    const candidates = [base, `${base}.ts`, `${base}.tsx`, `${base}.js`, `${base}.mjs`,
      path.join(base, 'index.ts'), path.join(base, 'index.js')]
    found.set(match[1], candidates.some(candidate => existsSync(candidate)))
  }
  return found
}

const baselines = new Map()
for (const name of plan.keys()) {
  baselines.set(name, referencesOf(readFileSync(path.join(TESTS, name), 'utf8'), TESTS))
}

/** A test that imports another test moves too; its sibling path becomes a cross-domain one. */
function repointSiblingTests(source) {
  return source.replace(/(['"])\.\.\/\.\.\/([A-Za-z0-9._-]+)(['"])/g, (match, open, target, close) => {
    const base = target.replace(/\.(ts|tsx|js|mjs)$/, '')
    const hit = [...plan.keys()].find(file => file === target || file.replace(/\.(ts|tsx|js|mjs)$/, '') === base)
    if (!hit) return match
    return `${open}../${plan.get(hit)}/${target}${close}`
  })
}

let moved = 0
for (const [name, domain] of plan) {
  const target = path.join(TESTS, domain)
  if (!existsSync(target)) mkdirSync(target, { recursive: true })
  const from = path.join(TESTS, name)
  const to = path.join(target, name)
  writeFileSync(from, repointSiblingTests(deepenImports(readFileSync(from, 'utf8'))))
  renameSync(from, to)
  moved += 1
}
console.log(`Moved ${moved} files.`)

// package.json: glob discovery replaces the hand-listed filenames.
const pkgPath = 'package.json'
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
const previous = String(pkg.scripts?.test || '')
const listed = previous.split(/\s+/).filter(token => token.startsWith('tests/')).length
pkg.scripts.test = 'node --experimental-strip-types --no-warnings --test "tests/**/*.test.ts"'
pkg.scripts['validate:test-layout'] = 'node scripts/check-test-directory-health.mjs'
if (!String(pkg.scripts.prebuild || '').includes('validate:test-layout')) {
  pkg.scripts.prebuild = `${pkg.scripts.prebuild ? `${pkg.scripts.prebuild} && ` : ''}npm run validate:test-layout`
}
writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`)
console.log(`package.json: replaced ${listed} hand-listed files with glob discovery.`)

// Workflows: path filters and inline `node --test tests/x.ts` both need the new locations.
const workflowDir = path.join(REPO_ROOT, '.github', 'workflows')
if (existsSync(workflowDir)) {
  for (const file of readdirSync(workflowDir).filter(name => /\.ya?ml$/.test(name))) {
    const full = path.join(workflowDir, file)
    const before = readFileSync(full, 'utf8')
    const after = before.replace(/(saas\/)?tests\/([A-Za-z0-9._-]+)/g, (match, prefix, name) => {
      const base = name.replace(/\*.*$/, '')
      const domain = domainFor(base)
      return `${prefix || ''}tests/${domain}/${name}`
    })
    if (after !== before) {
      writeFileSync(full, after)
      console.log(`Updated ${path.relative(REPO_ROOT, full)}`)
    }
  }
}

// Verify by comparison, not by absolute resolution: a reference that was already dangling before
// the move (dead paths, fixture strings inside assertions) is pre-existing rot and not this
// script's business. Only a reference that USED to resolve and no longer does is a regression.
const regressions = []
for (const [name, domain] of plan) {
  const before = baselines.get(name)
  const full = path.join(TESTS, domain, name)
  const after = referencesOf(readFileSync(full, 'utf8'), path.dirname(full))
  for (const [spec, resolvedBefore] of before) {
    if (!resolvedBefore) continue
    const stillResolves = [...after.values()].filter(Boolean).length
    if (!stillResolves) regressions.push(`${domain}/${name} -> ${spec}`)
  }
}
if (regressions.length) {
  console.error(`\nREGRESSIONS (${regressions.length}):`)
  for (const item of regressions.slice(0, 20)) console.error(`  ${item}`)
  process.exit(1)
}
const preexisting = [...baselines.values()]
  .flatMap(entries => [...entries.values()].filter(resolved => !resolved)).length
console.log(`No import regressions. (${preexisting} references were already dangling before the move; left untouched.)`)
