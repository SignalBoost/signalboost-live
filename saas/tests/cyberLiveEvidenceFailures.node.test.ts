import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'

const script = readFileSync(new URL('../scripts/cyber-live-evidence.mjs', import.meta.url), 'utf8')
const ref = 'a'.repeat(40)
const hash = (source: string) => createHash('sha1').update(`blob ${Buffer.byteLength(source)}\0`).update(source).digest('hex')
const reader = `export const MAX_MANIFEST_FILE_CHARS = 4_000_000;
export async function readRepoFileFrom() { return { ok: true, content: JSON.stringify({ packages: {
  'node_modules/next': { version: '16.3.5' }, 'node_modules/postcss': { version: '8.5.23' }
} }) }; }`
const scanner = `import { readRepoFileFrom } from '@/lib/audit/repoTarget';
export async function scanDependencyAdvisories() { return { ok: true, branch: process.env.CYBER_EVIDENCE_REF,
  advisories: [], summary: { packagesScanned: 0, advisories: 0 }, coverage: { complete: false } }; }
async function queryOsv() { return []; }`

function execute(opts: { readerSource?: string; scannerSource?: string; omitReader?: boolean } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'cyber-evidence-proof-'))
  try {
    mkdirSync(join(root, 'saas/scripts'), { recursive: true })
    mkdirSync(join(root, 'saas/lib/audit'), { recursive: true })
    mkdirSync(join(root, 'saas/lib/cyber'), { recursive: true })
    writeFileSync(join(root, 'saas/scripts/cyber-live-evidence.mjs'), script)
    if (!opts.omitReader) writeFileSync(join(root, 'saas/lib/audit/repoTarget.ts'), opts.readerSource ?? reader)
    writeFileSync(join(root, 'saas/lib/cyber/dependencyScanner.ts'), opts.scannerSource ?? scanner)
    // No child can reach a live service. Verify cleanup even when module initialization fails.
    const preload = join(root, 'deny-network.mjs')
    writeFileSync(preload, `const original = globalThis.fetch = () => { throw new Error('Test forbids network'); };
process.on('beforeExit', () => { if (globalThis.fetch !== original) { console.error('fetch_not_restored'); process.exitCode = 99; } });`)
    const child = spawnSync(process.execPath, ['--import', preload, join(root, 'saas/scripts/cyber-live-evidence.mjs')], {
      cwd: root, encoding: 'utf8', timeout: 10_000,
      env: { PATH: process.env.PATH, GITHUB_REPOSITORY: 'SignalBoost/signalboost-live', CYBER_EVIDENCE_REF: ref },
    })
    assert.equal(child.error, undefined)
    assert.equal(child.signal, null)
    assert.doesNotMatch(child.stderr, /fetch_not_restored/)
    const reportPath = join(root, '.cyber-evidence/report.json')
    assert.ok(existsSync(reportPath), `Missing durable report: ${child.stderr.slice(0, 500)}`)
    const report = JSON.parse(readFileSync(reportPath, 'utf8'))
    assert.equal(report.repository, 'SignalBoost/signalboost-live')
    assert.equal(report.commit, ref)
    assert.ok(Number.isFinite(Date.parse(report.observedAt)))
    assert.ok(Number.isFinite(Date.parse(report.finishedAt)))
    return { report, exit: child.status }
  } finally { rmSync(root, { recursive: true, force: true }) }
}

for (const [label, change] of [
  ['an additional runtime import', `import './another-runtime-module.ts';\n${scanner}`],
  ['a TypeScript parse failure', `${scanner}\nconst invalid: = ;`],
  ['a changed reader alias', scanner.replace('@/lib/audit/repoTarget', '@/lib/audit/otherReader')],
] as const) {
  test(`live evidence persists source hashes and failure after ${label}`, () => {
    const { report, exit } = execute({ scannerSource: change })
    assert.equal(exit, 1)
    assert.equal(report.collectionSucceeded, false)
    assert.ok(report.error)
    assert.equal(report.scannerBlob, hash(change))
    assert.equal(report.readerBlob, hash(reader))
    assert.deepEqual(report.reports, [])
  })
}

test('live evidence writes a failed report when a source cannot be read', () => {
  const { report, exit } = execute({ omitReader: true })
  assert.equal(exit, 1)
  assert.equal(report.collectionSucceeded, false)
  assert.match(report.error, /ENOENT/)
  assert.equal(report.readerBlob, null)
  assert.equal(report.scannerBlob, null)
})

test('live evidence captures reader initialization failure and restores fetch', () => {
  const { report, exit } = execute({ readerSource: `throw new Error('reader initialization failed');\n${reader}` })
  assert.equal(exit, 1)
  assert.equal(report.collectionSucceeded, false)
  assert.equal(report.error, 'reader initialization failed')
  assert.deepEqual(report.reports, [])
})

test('live evidence guards module initialization against out-of-scope requests', () => {
  const { report, exit } = execute({ readerSource: `await fetch('https://example.invalid/not-authorized');\n${reader}` })
  assert.equal(exit, 1)
  assert.equal(report.collectionSucceeded, false)
  assert.equal(report.error, 'Evidence request is outside the fixed read-only scope')
})

test('live evidence retains completed observations when a later scan fails', () => {
  const changed = scanner.replace('return { ok: true, branch:', "if (globalThis.__secondScan) throw new Error('second scan failed'); globalThis.__secondScan = true; return { ok: true, branch:")
  const { report, exit } = execute({ scannerSource: changed })
  assert.equal(exit, 1)
  assert.equal(report.collectionSucceeded, false)
  assert.equal(report.error, 'second scan failed')
  assert.equal(report.reports.length, 1)
  assert.equal(report.reports[0].scope, '/')
})

test('successful live evidence retains exact-ref reports and locked-package observations', () => {
  const { report, exit } = execute()
  assert.equal(exit, 0)
  assert.equal(report.collectionSucceeded, true)
  assert.equal(report.error, undefined)
  assert.equal(report.reports.length, 2)
  assert.equal(report.lockedPackages.length, 4)
  assert.deepEqual(report.lockedAdvisories, [])
  assert.equal(report.scannerBlob, hash(scanner))
  assert.equal(report.readerBlob, hash(reader))
})
