// saas/scripts/build-portable.mjs
//
// Canonical Self-Healing Supervisor release builder. It accepts a release only
// after boundary validation, strict ESM compilation, declaration generation,
// supply-chain evidence, npm packing, clean installation, public import and the
// five-language / three-risk-category acceptance matrix.

import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const REPO_ROOT = path.resolve(APP_ROOT, '..')
const BUILD_ROOT = path.join(APP_ROOT, 'dist', 'self-healing-build')
const SOURCE_ROOT = path.join(BUILD_ROOT, 'src')
const PACKAGE_ROOT = path.join(BUILD_ROOT, 'package')
const ARTIFACT_ROOT = path.join(APP_ROOT, 'dist', 'portable')
const ENTRY_POINT = 'lib/supervisor/portable/index.ts'
const PACKAGE_NAME = '@signalboost/self-healing-supervisor'
const PACKAGE_VERSION = '1.0.0-rc.2'
const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.mts', '.js', '.mjs']
const ALLOWED_BUILTINS = new Set([
  'assert', 'buffer', 'crypto', 'events', 'http', 'https', 'net', 'os', 'path',
  'perf_hooks', 'stream', 'timers', 'tls', 'url', 'util', 'worker_threads', 'zlib',
])
const DOCS = [
  ['../docs/portables/self-healing-technical-walkthrough.md', 'technical-walkthrough.md'],
  ['../docs/portables/self-healing-integration-guide.md', 'integration-guide.md'],
  ['../docs/portables/self-healing-evaluation-brief.md', 'evaluation-brief.md'],
  ['../docs/portables/self-healing-support-terms.md', 'support-terms.md'],
]

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
    env: { ...process.env, ...(options.env ?? {}) },
    encoding: options.capture ? 'utf8' : undefined,
  })
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function isBuiltin(specifier) {
  return specifier.startsWith('node:')
    ? ALLOWED_BUILTINS.has(specifier.slice(5))
    : ALLOWED_BUILTINS.has(specifier)
}

function resolveLocal(specifier, fromFile) {
  let base
  if (specifier.startsWith('@/')) base = path.join(APP_ROOT, specifier.slice(2))
  else if (specifier.startsWith('.')) base = path.resolve(path.dirname(fromFile), specifier)
  else return null

  const candidates = [base]
  for (const extension of SOURCE_EXTENSIONS) candidates.push(base + extension)
  if (/\.(?:js|mjs)$/.test(base)) {
    const withoutExtension = base.replace(/\.(?:js|mjs)$/, '')
    for (const extension of ['.ts', '.tsx', '.mts']) candidates.push(withoutExtension + extension)
  }
  for (const extension of SOURCE_EXTENSIONS) candidates.push(path.join(base, `index${extension}`))
  return candidates.find(candidate => fs.existsSync(candidate) && fs.statSync(candidate).isFile()) ?? null
}

function importSpecifiers(source) {
  const found = new Set()
  const stripped = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  for (const pattern of [
    /\bfrom\s*['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\bimport\s*['"]([^'"]+)['"]/g,
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ]) {
    let match
    while ((match = pattern.exec(stripped)) !== null) found.add(match[1])
  }
  return [...found]
}

function walkGraph() {
  const queue = [path.join(APP_ROOT, ENTRY_POINT)]
  const files = new Map()
  const external = new Map()
  const unresolved = []

  while (queue.length) {
    const absolute = path.resolve(queue.shift())
    if (files.has(absolute)) continue
    if (!absolute.startsWith(APP_ROOT + path.sep)) fail(`import graph escaped the SaaS root: ${absolute}`)
    if (!fs.existsSync(absolute)) fail(`entry or dependency does not exist: ${normalize(path.relative(APP_ROOT, absolute))}`)

    const source = fs.readFileSync(absolute, 'utf8')
    files.set(absolute, source)
    for (const specifier of importSpecifiers(source)) {
      if (isBuiltin(specifier)) continue
      const resolved = resolveLocal(specifier, absolute)
      if (resolved) queue.push(path.resolve(resolved))
      else if (specifier.startsWith('.') || specifier.startsWith('@/')) unresolved.push({ from: absolute, specifier })
      else {
        if (!external.has(specifier)) external.set(specifier, new Set())
        external.get(specifier).add(absolute)
      }
    }
  }

  if (unresolved.length) {
    fail(`unresolved portable imports:\n${unresolved.map(item => `  ${normalize(path.relative(APP_ROOT, item.from))} -> ${item.specifier}`).join('\n')}`)
  }
  if (external.size) {
    fail(`portable runtime reaches external packages:\n${[...external].map(([name, importers]) => `  ${name}: ${[...importers].map(file => normalize(path.relative(APP_ROOT, file))).join(', ')}`).join('\n')}`)
  }
  return files
}

function compiledSpecifier(specifier, fromFile) {
  const resolved = resolveLocal(specifier, fromFile)
  if (!resolved) return specifier
  let relative = normalize(path.relative(path.dirname(fromFile), resolved))
  if (!relative.startsWith('.')) relative = `./${relative}`
  return relative.replace(/\.(?:ts|tsx|mts|js|mjs)$/, '.js')
}

function rewriteImports(source, fromFile) {
  return source.replace(/(['"])(@\/[^'"]+|\.{1,2}\/[^'"]+)\1/g, (_whole, quote, specifier) => {
    return `${quote}${compiledSpecifier(specifier, fromFile)}${quote}`
  })
}

function writeSources(files) {
  for (const [absolute, source] of files) {
    const destination = path.join(SOURCE_ROOT, path.relative(APP_ROOT, absolute))
    fs.mkdirSync(path.dirname(destination), { recursive: true })
    fs.writeFileSync(destination, rewriteImports(source, absolute), 'utf8')
  }
}

function allFiles(root) {
  const result = []
  const visit = current => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name)
      if (entry.isDirectory()) visit(absolute)
      else result.push(absolute)
    }
  }
  visit(root)
  return result.sort((left, right) => normalize(path.relative(root, left)).localeCompare(normalize(path.relative(root, right))))
}

function sourceCommit() {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA
  try { return String(run('git', ['rev-parse', 'HEAD'], { cwd: REPO_ROOT, capture: true })).trim() }
  catch { return 'unknown' }
}

function copyDocumentation() {
  const docsRoot = path.join(PACKAGE_ROOT, 'docs')
  fs.mkdirSync(docsRoot, { recursive: true })
  for (const [sourceRelative, destinationName] of DOCS) {
    const source = path.resolve(APP_ROOT, sourceRelative)
    if (!fs.existsSync(source)) fail(`buyer document is missing: ${sourceRelative}`)
    fs.copyFileSync(source, path.join(docsRoot, destinationName))
  }
}

function writePackageMetadata(moduleCount) {
  const packageJson = {
    name: PACKAGE_NAME,
    version: PACKAGE_VERSION,
    description: 'Design-partner evaluation package for buyer-hosted incident intake, diagnosis, policy evaluation, approval routing, bounded repair execution and audit evidence.',
    type: 'module',
    exports: {
      '.': {
        types: './dist/lib/supervisor/portable/index.d.ts',
        import: './dist/lib/supervisor/portable/index.js',
        default: './dist/lib/supervisor/portable/index.js',
      },
    },
    main: './dist/lib/supervisor/portable/index.js',
    types: './dist/lib/supervisor/portable/index.d.ts',
    files: ['dist', 'docs', 'README.md', 'LICENSE-EVALUATION.md', 'manifest.json', 'sbom.json', 'SHA256SUMS'],
    engines: { node: '>=22' },
    dependencies: {},
    license: 'UNLICENSED',
  }
  fs.writeFileSync(path.join(PACKAGE_ROOT, 'package.json'), `${JSON.stringify(packageJson, null, 2)}\n`)
  fs.writeFileSync(path.join(PACKAGE_ROOT, 'README.md'), `# Self-Healing Supervisor — Design-Partner Evaluation\n\nThis package runs inside the buyer's environment. It has no vendor-hosted control plane and no vendor telemetry.\n\n## Install\n\n\`\`\`bash\nnpm install ./signalboost-self-healing-supervisor-${PACKAGE_VERSION}.tgz\n\`\`\`\n\n## Import\n\n\`\`\`js\nimport { createLicensedSelfHealingSupervisor } from '${PACKAGE_NAME}'\n\`\`\`\n\nPaid planning and dispatch can be constructed only through the licensed factory. Every provider-bound read, verification or mutation requires an explicit buyer capability. Unknown capabilities never execute, even after approval. Registered consequential capabilities require an exact signed continuation bound to the canonical plan fingerprint.\n\nThis is an evaluation release, not a production licence grant. See LICENSE-EVALUATION.md.\n`)
  fs.writeFileSync(path.join(PACKAGE_ROOT, 'LICENSE-EVALUATION.md'), `# Evaluation-only notice\n\nVersion ${PACKAGE_VERSION} is supplied only for technical evaluation by an authorized design partner. It does not grant production, redistribution, resale, sublicensing or public-hosting rights. Production use requires a separate signed software agreement identifying the vendor legal entity, buyer, fees, governing law, liability terms, support terms and termination rights.\n`)

  const compiledFiles = allFiles(path.join(PACKAGE_ROOT, 'dist')).map(file => ({
    path: normalize(path.relative(PACKAGE_ROOT, file)),
    bytes: fs.statSync(file).size,
    sha256: sha256(fs.readFileSync(file)),
  }))
  const manifest = {
    schema: 'self-healing-supervisor-release/2',
    id: 'self-healing-supervisor',
    name: 'Self-Healing Supervisor',
    version: PACKAGE_VERSION,
    releaseStage: 'design-partner-evaluation',
    sourceCommit: sourceCommit(),
    builtAt: new Date().toISOString(),
    moduleCount,
    entryPoint: 'dist/lib/supervisor/portable/index.js',
    typeEntryPoint: 'dist/lib/supervisor/portable/index.d.ts',
    licensing: {
      model: 'contractual source delivery; not tamper-proof',
      planningFeature: 'repair.plan',
      dispatchFeature: 'repair.dispatch',
      alwaysAvailable: ['observe', 'audit export'],
    },
    safety: {
      providerCalls: 'explicit capability required for read, verify and mutation',
      unknownApiCapabilities: 'never executable',
      consequentialContinuation: 'canonical plan SHA-256, exact scope, Ed25519 signature, expiration, prior-audit reference and one-time nonce',
      platformFallbacks: false,
    },
    knownLimitations: [
      'Production use requires a separate signed software agreement.',
      'A buyer-like external deployment and upgrade/rollback acceptance remain release-gate evidence.',
      'The buyer supplies and validates every real provider runner and capability registration.',
    ],
    files: compiledFiles,
  }
  fs.writeFileSync(path.join(PACKAGE_ROOT, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)

  const sbom = {
    bomFormat: 'CycloneDX',
    specVersion: '1.5',
    version: 1,
    metadata: {
      timestamp: manifest.builtAt,
      component: {
        type: 'library',
        'bom-ref': `${PACKAGE_NAME}@${PACKAGE_VERSION}`,
        group: 'signalboost',
        name: 'self-healing-supervisor',
        version: PACKAGE_VERSION,
      },
    },
    components: [],
    dependencies: [{ ref: `${PACKAGE_NAME}@${PACKAGE_VERSION}`, dependsOn: [] }],
  }
  fs.writeFileSync(path.join(PACKAGE_ROOT, 'sbom.json'), `${JSON.stringify(sbom, null, 2)}\n`)
}

function writeChecksums() {
  const files = allFiles(PACKAGE_ROOT).filter(file => path.basename(file) !== 'SHA256SUMS')
  fs.writeFileSync(path.join(PACKAGE_ROOT, 'SHA256SUMS'), `${files.map(file => `${sha256(fs.readFileSync(file))}  ${normalize(path.relative(PACKAGE_ROOT, file))}`).join('\n')}\n`)
}

function pack() {
  fs.mkdirSync(ARTIFACT_ROOT, { recursive: true })
  for (const file of fs.readdirSync(ARTIFACT_ROOT)) {
    if (file.includes('self-healing-supervisor') || ['manifest.json', 'sbom.json', 'SHA256SUMS'].includes(file)) {
      fs.rmSync(path.join(ARTIFACT_ROOT, file), { recursive: true, force: true })
    }
  }
  const output = String(run('npm', ['pack', '--json', '--pack-destination', ARTIFACT_ROOT], { cwd: PACKAGE_ROOT, capture: true }))
  let filename
  try { filename = JSON.parse(output)[0].filename } catch { fail(`npm pack did not return parseable JSON: ${output}`) }
  const archive = path.join(ARTIFACT_ROOT, filename)
  if (!fs.existsSync(archive)) fail(`npm pack did not produce ${archive}`)
  for (const name of ['manifest.json', 'sbom.json', 'SHA256SUMS']) {
    fs.copyFileSync(path.join(PACKAGE_ROOT, name), path.join(ARTIFACT_ROOT, name))
  }
  fs.writeFileSync(`${archive}.sha256`, `${sha256(fs.readFileSync(archive))}  ${path.basename(archive)}\n`)
  return archive
}

function cleanInstallAndAccept(archive) {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'self-healing-clean-install-'))
  try {
    fs.writeFileSync(path.join(work, 'package.json'), `${JSON.stringify({ private: true, type: 'module' }, null, 2)}\n`)
    run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', archive], { cwd: work })
    const script = `
      import * as supervisor from '${PACKAGE_NAME}'
      const required = [
        'createLicensedSelfHealingSupervisor',
        'createApiCapabilityRegistry',
        'createEd25519ApprovalVerifier',
        'fingerprintRepairPlan',
        'runAcceptanceScenario',
        'approvalCopy',
      ]
      for (const name of required) {
        if (typeof supervisor[name] !== 'function') throw new Error('missing public export: ' + name)
      }
      const locales = ['en', 'es', 'pt', 'pl', 'ru']
      const categories = ['financial', 'destructive', 'credential_security']
      for (const locale of locales) {
        for (const category of categories) {
          const received = []
          const host = {
            secrets: { async getSecret() { return undefined } },
            notifications: { async notify(notification) { received.push(notification) } },
            approvers: { async approversFor() { return [{ id: 'approver-1', displayName: 'Evaluator', address: 'evaluator@example.invalid' }] } },
            branding: { productName: 'Buyer Supervisor', consoleBaseUrl: 'https://buyer.example.invalid', locale },
          }
          const result = await supervisor.runAcceptanceScenario({ host, dangerousCategory: category })
          if (!result.passed) throw new Error(locale + '/' + category + ' acceptance failed: ' + result.summary)
          const expectedHeading = supervisor.approvalCopy(locale).heading
          if (!received.some(notification => notification.title.includes(expectedHeading))) {
            throw new Error(locale + '/' + category + ' notification did not use localized catalogue')
          }
        }
      }
      console.log('clean install, public ESM import, five-language acceptance: pass')
    `
    fs.writeFileSync(path.join(work, 'acceptance.mjs'), script)
    run(process.execPath, ['acceptance.mjs'], { cwd: work })
  } finally {
    fs.rmSync(work, { recursive: true, force: true })
  }
}

function main() {
  const checkOnly = process.argv.includes('--check')
  const files = walkGraph()
  console.log(`Portable graph: ${files.size} source modules; external runtime packages: 0.`)
  if (checkOnly) {
    console.log('Boundary check passed. No artifact written.')
    return
  }

  fs.rmSync(BUILD_ROOT, { recursive: true, force: true })
  fs.mkdirSync(SOURCE_ROOT, { recursive: true })
  fs.mkdirSync(PACKAGE_ROOT, { recursive: true })
  // Under NodeNext, the nearest package.json determines whether .ts sources emit
  // ESM or CommonJS. Establish ESM identity before invoking TypeScript.
  fs.writeFileSync(path.join(BUILD_ROOT, 'package.json'), `${JSON.stringify({ private: true, type: 'module' }, null, 2)}\n`)
  writeSources(files)

  const tsconfig = {
    compilerOptions: {
      target: 'ES2022',
      module: 'NodeNext',
      moduleResolution: 'NodeNext',
      rootDir: './src',
      outDir: './package/dist',
      declaration: true,
      declarationMap: false,
      sourceMap: false,
      strict: true,
      skipLibCheck: true,
      noEmitOnError: true,
      forceConsistentCasingInFileNames: true,
      types: ['node'],
    },
    include: ['./src/**/*.ts', './src/**/*.mts'],
  }
  const tsconfigPath = path.join(BUILD_ROOT, 'tsconfig.json')
  fs.writeFileSync(tsconfigPath, `${JSON.stringify(tsconfig, null, 2)}\n`)
  const tsc = path.join(APP_ROOT, 'node_modules', 'typescript', 'bin', 'tsc')
  if (!fs.existsSync(tsc)) fail('TypeScript compiler is not installed; run npm ci in saas/')
  run(process.execPath, [tsc, '-p', tsconfigPath])

  copyDocumentation()
  writePackageMetadata(files.size)
  writeChecksums()
  const archive = pack()
  cleanInstallAndAccept(archive)

  console.log(`\nRelease accepted: ${normalize(path.relative(APP_ROOT, archive))}`)
  console.log(`Version: ${PACKAGE_VERSION}`)
  console.log('Evidence: manifest.json, sbom.json, SHA256SUMS and archive checksum')
}

main()
