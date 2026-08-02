// saas/scripts/build-marketing-sales-portable.mjs
//
// Marketing + Sales release builder and boundary guard.
//
// Same machinery as build-social-portable.mjs, aimed at the larger barrel. The two
// artifacts come from one codebase by design: Social Outreach Connector is publishing
// only and sells on its own; Marketing + Sales adds the email outreach surface and is
// never sold without the connector. Keeping them as two entry points into the same
// files means the smaller product can never drift from the half of the larger one it
// is supposed to be.
//
// Two jobs, and the second is the one that matters commercially.
//
// 1. It produces a tarball a buyer can install into their own stack.
// 2. It PROVES the portability claim instead of asserting it. The build walks the
//    import graph from the public barrel and refuses to produce an artifact if any
//    reachable file imports a host path (`@/...`), escapes the layer's own directory,
//    or pulls in a third-party package. "Portable" then means something a buyer's
//    engineer can verify in one command, rather than a word in a sales document.
//
// That second job is also the regression guard. The layer is genuinely closed today —
// seven files, zero external imports — but nothing stops a future edit from adding
// `import { getAdminSupabase } from '@/utils/supabase/server'` to a connector. With
// this wired into CI that edit fails the build; without it, the portable quietly stops
// being portable and nobody notices until a buyer's install fails.
//
// Usage:
//   node scripts/build-social-portable.mjs --check   boundary validation only
//   node scripts/build-social-portable.mjs           validate, compile, pack

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const REPO_ROOT = path.resolve(APP_ROOT, '..')
const ENTRY = 'lib/outreach/marketing-sales-portable.ts'
// Everything reachable from the entry point must live inside this directory. The check
// is a prefix test on the resolved path, so a `../../utils/...` escape is caught even
// though it is written as a relative import.
// The portable spans TWO directories: the outreach layer and the ads layer. Paid
// placement is marketing, so it belongs to this product rather than beside it — but it
// keeps its own folder because its risk profile is different and mixing spend code into
// the publishing files would blur that.
//
// Everything reachable from the barrel must live in one of these. A reach outside both
// is still a boundary violation, so widening the layer does not weaken the check.
const LAYER_DIRS = ['lib/outreach', 'lib/ads']
const LAYER_DIR = LAYER_DIRS[0] // where packaged paths are rooted
const PACKAGE_NAME = '@signalboost/marketing-sales'
const PACKAGE_VERSION = '1.0.0-rc.1'
const BUILD_ROOT = path.join(APP_ROOT, 'dist', 'marketing-sales-build')
const PACKAGE_ROOT = path.join(BUILD_ROOT, 'package')
const ARTIFACT_ROOT = path.join(APP_ROOT, 'dist', 'portable')
const DOCS = [
  ['../docs/portables/social-outreach-integration-guide.md', 'social-integration-guide.md'],
]

const checkOnly = process.argv.includes('--check')

function fail(message) {
  console.error(`\nRELEASE BLOCKED: ${message}\n`)
  process.exit(1)
}

function normalize(file) {
  return file.split(path.sep).join('/')
}

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: options.cwd ?? APP_ROOT,
    stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    encoding: options.capture ? 'utf8' : undefined,
  })
}

// Import specifiers, including type-only imports and re-exports. A `export ... from`
// pulls a module into the graph exactly as an import does, and missing those is how a
// boundary check ends up passing on a graph it never fully walked.
function specifiersOf(source) {
  const found = []
  const patterns = [
    /\bimport\s+[^'"]*?\bfrom\s*['"]([^'"]+)['"]/g,
    /\bexport\s+[^'"]*?\bfrom\s*['"]([^'"]+)['"]/g,
    /\bimport\s*['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ]
  for (const pattern of patterns) {
    let match
    while ((match = pattern.exec(source))) found.push(match[1])
  }
  return found
}

function resolveSpecifier(fromFile, specifier) {
  const base = path.resolve(path.dirname(fromFile), specifier)
  const candidates = [base, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts')]
  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate
  }
  return null
}

function walk() {
  const entryPath = path.join(APP_ROOT, ENTRY)
  if (!fs.existsSync(entryPath)) fail(`entry point ${ENTRY} does not exist`)

  const layerRoots = LAYER_DIRS.map(dir => path.join(APP_ROOT, dir))
  const seen = new Set()
  const queue = [entryPath]
  const violations = []

  while (queue.length) {
    const file = queue.shift()
    if (seen.has(file)) continue
    seen.add(file)

    const source = fs.readFileSync(file, 'utf8')
    const relative = normalize(path.relative(APP_ROOT, file))

    for (const specifier of specifiersOf(source)) {
      // Node builtins are fine — a portable may read a stream or hash a buffer.
      if (specifier.startsWith('node:')) continue

      if (specifier.startsWith('@/')) {
        violations.push(`${relative} imports the host alias '${specifier}' — aliases are a SignalBoost tsconfig path and do not resolve for a buyer`)
        continue
      }

      if (!specifier.startsWith('.')) {
        violations.push(`${relative} imports the third-party package '${specifier}' — the portable must install with zero dependencies`)
        continue
      }

      const resolved = resolveSpecifier(file, specifier)
      if (!resolved) {
        violations.push(`${relative} imports '${specifier}' which does not resolve to a file`)
        continue
      }

      if (!layerRoots.some(root => resolved.startsWith(root + path.sep))) {
        violations.push(`${relative} imports '${specifier}' which resolves outside ${LAYER_DIRS.join(' and ')} (${normalize(path.relative(APP_ROOT, resolved))})`)
        continue
      }

      queue.push(resolved)
    }
  }

  return { files: [...seen].sort(), violations }
}

const { files, violations } = walk()

if (violations.length) {
  console.error('\nBoundary violations:')
  for (const violation of violations) console.error(`  - ${violation}`)
  fail(`${violations.length} boundary violation(s). The layer is not portable as written.`)
}

console.log(`Boundary holds: ${files.length} files reachable from ${ENTRY} across ${LAYER_DIRS.join(' + ')}, zero host imports, zero dependencies.`)
for (const file of files) console.log(`  ${normalize(path.relative(APP_ROOT, file))}`)

if (checkOnly) process.exit(0)

// ── Package ──────────────────────────────────────────────────────────────────
fs.rmSync(BUILD_ROOT, { recursive: true, force: true })
fs.mkdirSync(path.join(PACKAGE_ROOT, 'src'), { recursive: true })

for (const file of files) {
  // Preserve which layer a file came from, so src/outreach/... and src/ads/... stay
  // distinguishable in the installed package.
  const relative = path.relative(APP_ROOT, file).replace(/^lib[\\/]/, '')
  const target = path.join(PACKAGE_ROOT, 'src', relative)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.copyFileSync(file, target)
}

for (const [source, name] of DOCS) {
  const from = path.resolve(APP_ROOT, source)
  if (fs.existsSync(from)) fs.copyFileSync(from, path.join(PACKAGE_ROOT, name))
  else console.warn(`  note: ${source} not found — packaged without it`)
}

const manifest = {
  name: PACKAGE_NAME,
  version: PACKAGE_VERSION,
  type: 'module',
  description: 'Email outreach and social publishing in one portable engine, running inside the buyer\'s own environment on their own credentials.',
  main: 'src/outreach/marketing-sales-portable.ts',
  types: 'src/outreach/marketing-sales-portable.ts',
  files: ['src', '*.md'],
  // Deliberately empty and deliberately asserted. A buyer's security review asks what
  // transitive packages arrive with this; the honest answer is none.
  dependencies: {},
  license: 'SEE LICENSE IN integration-guide.md',
}
fs.writeFileSync(path.join(PACKAGE_ROOT, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`)

// A per-file digest so a buyer can verify the artifact they received is the artifact
// that was built, without trusting the channel it arrived through.
const digest = files
  .map(file => {
    const relative = normalize(path.relative(APP_ROOT, file).replace(/^lib[\\/]/, ''))
    const hash = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
    return `${hash}  src/${relative}`
  })
  .join('\n')
fs.writeFileSync(path.join(PACKAGE_ROOT, 'SHA256SUMS.txt'), `${digest}\n`)

fs.mkdirSync(ARTIFACT_ROOT, { recursive: true })
const packed = run('npm', ['pack', '--pack-destination', ARTIFACT_ROOT], { cwd: PACKAGE_ROOT, capture: true }).trim()
const tarball = path.join(ARTIFACT_ROOT, packed.split('\n').pop().trim())

// Install the packed tarball into a throwaway directory and confirm the public entry
// point is present. Packing successfully is not the same as producing something that
// installs — the difference has bitten this repo before.
const proving = fs.mkdtempSync(path.join(os.tmpdir(), 'marketing-sales-portable-'))
fs.writeFileSync(path.join(proving, 'package.json'), JSON.stringify({ name: 'proving-ground', private: true, type: 'module' }, null, 2))
run('npm', ['install', tarball, '--no-audit', '--no-fund'], { cwd: proving })

const installedEntry = path.join(proving, 'node_modules', ...PACKAGE_NAME.split('/'), 'src', 'outreach', 'marketing-sales-portable.ts')
if (!fs.existsSync(installedEntry)) fail('installed package does not contain its entry point')

const installedManifest = JSON.parse(fs.readFileSync(path.join(proving, 'node_modules', ...PACKAGE_NAME.split('/'), 'package.json'), 'utf8'))
if (Object.keys(installedManifest.dependencies ?? {}).length) fail('installed package declares dependencies — the zero-dependency claim is false')

fs.rmSync(proving, { recursive: true, force: true })

const size = (fs.statSync(tarball).size / 1024).toFixed(1)
console.log(`\nBuilt ${normalize(path.relative(REPO_ROOT, tarball))} (${size} KB)`)
console.log(`  ${files.length} source files, 0 dependencies, installed and verified in a clean directory.`)
