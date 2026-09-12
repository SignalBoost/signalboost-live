// Read-only evidence from the real scanner and GitHub reader at an exact commit.
// This is not an authenticated application scan, an upgrade, or a security clearance.
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { stripTypeScriptTypes } from 'node:module'

const repo = 'SignalBoost/signalboost-live'
const ref = process.env.CYBER_EVIDENCE_REF || ''
if (process.env.GITHUB_REPOSITORY !== repo || !/^[a-f0-9]{40}$/.test(ref)) {
  throw new Error('Exact repository and immutable evidence ref are required')
}
const output = new URL('../../.cyber-evidence/', import.meta.url)
mkdirSync(output, { recursive: true })
const blobHash = text => createHash('sha1').update(`blob ${Buffer.byteLength(text)}\0`).update(text).digest('hex')
const moduleUrl = text => `data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(text)).toString('base64')}`
const originalFetch = globalThis.fetch
// Only the authoritative GitHub/OSV APIs are contacted. No source reference URL
// is followed, no hosted model is used, and no mutation endpoint is invoked.
globalThis.fetch = (input, init = {}) => {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url)
  const method = (init.method || (input instanceof Request ? input.method : 'GET')).toUpperCase()
  const permitted = (url.origin === 'https://api.github.com' && method === 'GET'
    && url.pathname.startsWith(`/repos/${repo}/`))
    || (url.origin === 'https://api.osv.dev'
      && ((method === 'POST' && url.pathname === '/v1/querybatch')
        || (method === 'GET' && /^\/v1\/vulns\/[A-Za-z0-9._-]+$/.test(url.pathname))))
  if (!permitted) throw new Error('Evidence request is outside the fixed read-only scope')
  const headers = new Headers(init.headers)
  if (url.origin !== 'https://api.github.com') headers.delete('authorization')
  return originalFetch(input, { ...init, headers, redirect: 'error',
    signal: init.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(15_000)]) : AbortSignal.timeout(15_000) })
}

const evidence = {
  repository: repo, commit: ref, observedAt: new Date().toISOString(),
  execution: 'read-only GitHub Actions; not a signed-in Production scan',
  scannerBlob: null, readerBlob: null,
  reports: [], lockedPackages: [], lockedAdvisories: [], limitations: [
    'Repository scans are capped at 250 packages. Unresolved ranges and unreadable manifests remain explicit coverage limitations; a lockfile does not establish runtime installation.',
    'The separate Next.js/PostCSS focus uses exact lockfile versions. Lockfiles are not proof of runtime reachability or exploitation.',
    'Collection success is not a security clearance or evidence that a dependency was repaired.',
  ],
}
let failure
try {
  // Source reads, parsing, alias validation and imports are collection work too.
  // Their failures must retain a commit-bound report and restore the fetch guard.
  const readerSource = readFileSync(new URL('../lib/audit/repoTarget.ts', import.meta.url), 'utf8')
  evidence.readerBlob = blobHash(readerSource)
  const scannerSource = readFileSync(new URL('../lib/cyber/dependencyScanner.ts', import.meta.url), 'utf8')
  evidence.scannerBlob = blobHash(scannerSource)
  const readerUrl = moduleUrl(readerSource)
  const alias = "'@/lib/audit/repoTarget'"
  if (scannerSource.split(alias).length !== 2) throw new Error('Scanner reader import changed; update this evidence harness')
  // Export the existing private lookup for exact lockfile-version checks in this
  // process only. Neither a production route nor scanner behavior is modified.
  const scannerUrl = moduleUrl(scannerSource.replace(alias, JSON.stringify(readerUrl))
    + '\nexport { queryOsv as queryLockedVersions };\n')
  const reader = await import(readerUrl)
  const scanner = await import(scannerUrl)
  for (const suffix of ['', '/saas']) {
    const report = await scanner.scanDependencyAdvisories({
      url: `https://github.com/${repo}/tree/${ref}${suffix}`, maxPackages: 250,
    })
    evidence.reports.push({ scope: suffix || '/', report })
    if (!report.ok || report.branch !== ref) throw new Error(report.error || 'Exact-ref repository scan failed')
  }
  for (const sourceFile of ['package-lock.json', 'saas/package-lock.json']) {
    const result = await reader.readRepoFileFrom(repo, ref, sourceFile, { maxChars: reader.MAX_MANIFEST_FILE_CHARS })
    if (!result.ok || result.truncated || !result.content) throw new Error(`Cannot verify locked versions in ${sourceFile}`)
    const lock = JSON.parse(result.content)
    for (const name of ['next', 'postcss']) {
      const version = lock.packages?.[`node_modules/${name}`]?.version || lock.dependencies?.[name]?.version
      if (typeof version !== 'string' || !/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version)) {
        throw new Error(`Exact locked ${name} version missing in ${sourceFile}`)
      }
      evidence.lockedPackages.push({ name, version, sourceFile, ecosystem: 'npm' })
    }
  }
  evidence.lockedAdvisories = await scanner.queryLockedVersions(evidence.lockedPackages)
  if (evidence.lockedAdvisories.some(a => a.detailStatus !== 'available')) {
    throw new Error('Some locked-package advisory details could not be verified')
  }
} catch (error) {
  failure = error instanceof Error ? error.message : 'Evidence collection failed'
} finally {
  globalThis.fetch = originalFetch
  evidence.finishedAt = new Date().toISOString()
  evidence.collectionSucceeded = !failure
  if (failure) evidence.error = failure
  writeFileSync(new URL('report.json', output), `${JSON.stringify(evidence, null, 2)}\n`)
  console.log(JSON.stringify({ repository: repo, commit: ref, collectionSucceeded: !failure,
    scans: evidence.reports.map(({ scope, report }) => ({ scope, ok: report.ok, summary: report.summary, coverage: report.coverage })),
    lockedPackages: evidence.lockedPackages,
    lockedAdvisories: evidence.lockedAdvisories.map(a => ({ package: a.packageName, version: a.version,
      source: a.sourceFile, id: a.id, severity: a.severity, fixedVersions: a.fixedVersions, summary: a.summary })),
    error: failure }, null, 2))
}
if (failure) process.exitCode = 1
