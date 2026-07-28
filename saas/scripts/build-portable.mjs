// saas/scripts/build-portable.mjs
//
// BUILD THE SELLABLE ARTIFACT.
//
// The portable is written as a library with a real injection boundary, but it has never had
// a delivery vehicle: no package.json, no build, no tarball. "Send them the portable" has
// meant "give them repo access and tell them which directories to copy", which is a code
// handoff dressed as a product. This script produces the thing a buyer can actually install.
//
// WHY A BUILD SCRIPT RATHER THAN MOVING FILES. Relocating ~80 files to carve out a package
// directory would be a very large change to a repo that is under active edit by several
// lanes. This instead computes the payload from the import graph and assembles it into a
// staging directory, leaving the source tree exactly where it is. The boundary becomes
// something checked on every build rather than something a directory layout implies.
//
// WHAT IT DOES
//   1. Walks the import graph from the portable's entry points.
//   2. Excludes host implementations — anything reaching a third-party service client. Those
//      are SignalBoost's choices, not the product, and shipping them would drag a database
//      SDK into a buyer's dependency tree for no reason.
//   3. Rewrites '@/x' aliases to relative paths, since a buyer has no such alias.
//   4. Strips re-export lines pointing at excluded files, so the barrels still compile.
//   5. Emits package.json, tsconfig.json and a README, then reports the payload.
//
// THE TEST THIS SCRIPT ENCODES: a payload that needs a third-party runtime dependency is not
// portable. If EXTERNAL DEPENDENCIES reports anything other than Node built-ins, the
// boundary has leaked and the build says so rather than shipping it quietly.
//
// USAGE
//   node scripts/build-portable.mjs            # assemble into dist/portable
//   node scripts/build-portable.mjs --check    # verify the boundary, write nothing

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT_DIR = path.join(APP_ROOT, 'dist', 'portable')

const ENTRY_POINTS = [
  'lib/supervisor/portable/index.ts',
  'portable-license/index.ts',
]

// Host implementations are identified by BEHAVIOUR, not by a hand-maintained name list: a
// file that reaches a third-party package is, by definition, a choice of infrastructure
// rather than product behaviour, and it belongs in the buyer's host adapter. Detecting them
// this way means a new one added later is caught on the next build instead of silently
// dragging an SDK into a buyer's dependency tree.

const ALLOWED_EXTERNALS = new Set(['node:crypto', 'node:util', 'node:buffer', 'node:timers', 'crypto'])

const PACKAGE_NAME = '@signalboost/self-healing-supervisor'
const PACKAGE_VERSION = '1.0.0'

const IMPORT_RE = /(?:from|import)\s+'([^']+)'/g
const REEXPORT_LINE_RE = /^\s*export\s+(?:\*|\{[^}]*\})\s+from\s+'([^']+)';?\s*$/


function resolveSpecifier(specifier, fromFile) {
  let target
  if (specifier.startsWith('@/')) target = specifier.slice(2)
  else if (specifier.startsWith('.')) target = path.join(path.dirname(fromFile), specifier)
  else return null
  target = path.normalize(target)
  for (const candidate of [target, `${target}.ts`, `${target}.tsx`, path.join(target, 'index.ts')]) {
    if (fs.existsSync(path.join(APP_ROOT, candidate)) && fs.statSync(path.join(APP_ROOT, candidate)).isFile()) {
      return candidate.split(path.sep).join('/')
    }
  }
  return null
}

function walk() {
  const included = new Set()
  const excluded = new Set()
  const excludedPaths = new Set()
  const externals = new Set()
  const stack = [...ENTRY_POINTS]

  while (stack.length) {
    const file = stack.pop()
    if (included.has(file)) continue
    included.add(file)

    let source
    try {
      source = fs.readFileSync(path.join(APP_ROOT, file), 'utf8')
    } catch {
      continue
    }

    const specifiers = [...source.matchAll(IMPORT_RE)].map(match => match[1])
    const foreign = specifiers.filter(s => !s.startsWith('.') && !s.startsWith('@/') && !ALLOWED_EXTERNALS.has(s))

    if (foreign.length && !ENTRY_POINTS.includes(file)) {
      // A host implementation. Excluded, and its own imports are not followed — otherwise
      // its infrastructure dependencies would be pulled in behind it.
      included.delete(file)
      excluded.add(`${file}  (reaches ${foreign.join(', ')})`)
      excludedPaths.add(file)
      continue
    }

    for (const specifier of specifiers) {
      if (!specifier.startsWith('.') && !specifier.startsWith('@/')) {
        externals.add(specifier)
        continue
      }
      const resolved = resolveSpecifier(specifier, file)
      if (!resolved) continue
      stack.push(resolved)
    }
  }

  // A file may be reached before it is known to be a host implementation, so filter at the end.
  for (const file of excludedPaths) included.delete(file)
  return { included: [...included].sort(), excluded: [...excluded].sort(), externals: [...externals].sort(), excludedPaths }
}

function rewrite(file, source, included) {
  const lines = source.split('\n')
  const kept = []

  for (const line of lines) {
    const reexport = line.match(REEXPORT_LINE_RE)
    if (reexport) {
      const resolved = resolveSpecifier(reexport[1], file)
      // A barrel line pointing at a host implementation would not compile in the package.
      if (resolved && !included.has(resolved)) continue
    }
    kept.push(line)
  }

  return kept.join('\n').replace(IMPORT_RE, (whole, specifier) => {
    if (!specifier.startsWith('@/')) return whole
    const resolved = resolveSpecifier(specifier, file)
    if (!resolved) return whole
    let relative = path.relative(path.dirname(file), resolved).split(path.sep).join('/')
    if (!relative.startsWith('.')) relative = `./${relative}`
    return whole.replace(specifier, relative)
  })
}

function main() {
  const checkOnly = process.argv.includes('--check')
  const { included, excluded, externals, excludedPaths } = walk()

  const disallowed = externals.filter(name => !ALLOWED_EXTERNALS.has(name))

  console.log(`Payload: ${included.length} files from ${ENTRY_POINTS.length} entry points.`)
  console.log(`Excluded host implementations: ${excluded.length}`)
  for (const file of excluded) console.log(`   ${file}`)
  console.log(`External dependencies: ${externals.length ? externals.join(', ') : 'none'}`)

  if (disallowed.length) {
    console.error('\nThe payload reaches third-party packages, so it is not portable as built:')
    for (const name of disallowed) console.error(`   ${name}`)
    console.error('\nEach one belongs behind an interface the buyer implements in their host adapter.')
    process.exit(1)
  }

  if (checkOnly) {
    console.log('\nBoundary holds. Nothing written (--check).')
    return
  }

  fs.rmSync(OUT_DIR, { recursive: true, force: true })
  const includedSet = new Set(included)

  for (const file of included) {
    const source = fs.readFileSync(path.join(APP_ROOT, file), 'utf8')
    const destination = path.join(OUT_DIR, 'src', file)
    fs.mkdirSync(path.dirname(destination), { recursive: true })
    fs.writeFileSync(destination, rewrite(file, source, includedSet), 'utf8')
  }

  const entryExports = {}
  for (const entry of ENTRY_POINTS) {
    const name = entry.includes('portable-license') ? './license' : '.'
    entryExports[name] = { types: `./src/${entry}`, default: `./src/${entry}` }
  }

  fs.writeFileSync(path.join(OUT_DIR, 'package.json'), `${JSON.stringify({
    _path: 'dist/portable/package.json',
    name: PACKAGE_NAME,
    version: PACKAGE_VERSION,
    description: 'Self-Healing Supervisor — incident diagnosis, policy gating, approval routing and audit, running inside your own environment.',
    type: 'module',
    exports: entryExports,
    files: ['src', 'README.md'],
    engines: { node: '>=22' },
    dependencies: {},
    license: 'SEE LICENSE IN README.md',
  }, null, 2)}\n`, 'utf8')

  fs.writeFileSync(path.join(OUT_DIR, 'tsconfig.json'), `${JSON.stringify({
    compilerOptions: {
      target: 'ES2022',
      module: 'ESNext',
      moduleResolution: 'bundler',
      strict: true,
      declaration: true,
      allowImportingTsExtensions: true,
      noEmit: true,
      skipLibCheck: true,
    },
    include: ['src'],
  }, null, 2)}\n`, 'utf8')

  fs.writeFileSync(path.join(OUT_DIR, 'README.md'), [
    '<!-- dist/portable/README.md -->',
    '',
    '# Self-Healing Supervisor',
    '',
    'This package runs inside your environment. There is no vendor service in the path, no',
    'vendor account, and no telemetry.',
    '',
    '## Installing',
    '',
    '```bash',
    'npm install ./signalboost-self-healing-supervisor-' + PACKAGE_VERSION + '.tgz',
    '```',
    '',
    '## What you supply',
    '',
    'One file: a host adapter implementing `HostContext`. It provides your secrets, your',
    'datastore for the dispatch ledger, your notification channel, your SIEM sink, and the',
    'executor that touches your systems. The integration guide walks through each interface,',
    'and the reference adapter in the vendor repository is a worked example.',
    '',
    '## Dependencies',
    '',
    'None. The package uses only Node built-ins. Everything infrastructural arrives through',
    'the host adapter, which is what makes it portable rather than merely configurable.',
    '',
    '## Licence',
    '',
    'Planning and dispatch require a licence token. See the licence installation guide.',
    'Receiving, recording and auditing incidents are never gated.',
    '',
  ].join('\n'), 'utf8')

  console.log(`\nWrote ${OUT_DIR}`)
  console.log('Package it with:  cd dist/portable && npm pack')
}

main()
