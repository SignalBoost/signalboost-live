// One-off branch-only preparation. This script never creates commits or updates refs.
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'

const repository = 'SignalBoost/signalboost-live'
const branch = 'prep/cyber-dependency-patches-20260911'
const base = '5cef0dbbe5b89d9408cbd991b0afacb343d8e226'
const files = ['package.json', 'package-lock.json', 'saas/package.json', 'saas/package-lock.json']
const sha = text => createHash('sha1').update(`blob ${Buffer.byteLength(text)}\0`).update(text).digest('hex')
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim()
assert.equal(process.env.GITHUB_REPOSITORY, repository)
assert.equal(process.env.GITHUB_REF, `refs/heads/${branch}`)
assert.equal(git('rev-parse', 'HEAD'), process.env.GITHUB_SHA)
assert.equal(git('rev-parse', 'HEAD^'), base)
const output = '.cyber-patch-bundle'
mkdirSync(output, { recursive: true })
const mode = process.argv[2]
const validateDiff = () => {
  const changed = git('diff', '--name-only').split('\n').filter(Boolean).sort()
  assert.deepEqual(changed, [...files].sort(), 'Only the four dependency files may change')
}
if (mode === 'prepare') {
  const originals = Object.fromEntries(files.map(path => [path, readFileSync(path, 'utf8')]))
  for (const prefix of ['', 'saas/']) {
    const manifestPath = `${prefix}package.json`
    const manifest = JSON.parse(originals[manifestPath])
    assert.equal(manifest.dependencies.next, '16.2.6')
    assert.equal(manifest.dependencies.postcss, '^8.4.31')
    execFileSync('npm', ['install', '--package-lock-only', '--ignore-scripts', '--no-audit', '--no-fund', '--save-exact', '--registry=https://registry.npmjs.org', 'next@16.3.3', 'postcss@8.5.23'], {
      cwd: prefix || '.', stdio: 'inherit', timeout: 180_000,
    })
    // Keep the existing declared PostCSS range, while updating its exact locked
    // version. The lockfile root must continue to match the unchanged manifest.
    const updated = JSON.parse(readFileSync(manifestPath, 'utf8'))
    updated.dependencies.postcss = manifest.dependencies.postcss
    const expected = structuredClone(manifest)
    expected.dependencies.next = '16.3.3'
    assert.deepEqual(updated, expected, 'Unexpected manifest changes')
    writeFileSync(manifestPath, `${JSON.stringify(updated, null, 2)}\n`)
    const lockPath = `${prefix}package-lock.json`
    const lock = JSON.parse(readFileSync(lockPath, 'utf8'))
    lock.packages[''].dependencies.postcss = manifest.dependencies.postcss
    assert.equal(lock.packages[''].dependencies.next, '16.3.3')
    assert.equal(lock.packages['node_modules/next'].version, '16.3.3')
    assert.equal(lock.packages['node_modules/postcss'].version, '8.5.23')
    writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`)
  }
  validateDiff()
  const focused = []
  const changes = []
  for (const file of files.filter(p => p.endsWith('package-lock.json'))) {
    const before = JSON.parse(originals[file]).packages
    const after = JSON.parse(readFileSync(file, 'utf8')).packages
    for (const [path, entry] of Object.entries(after)) {
      if (/(^|\/)node_modules\/(next|postcss)$/.test(path)) focused.push({ name: path.split('/').at(-1), version: entry.version, sourceFile: file, path })
      if (entry.version !== before[path]?.version) changes.push({ file, path, before: before[path]?.version || null, after: entry.version || null })
    }
    for (const path of Object.keys(before)) if (!Object.hasOwn(after, path)) changes.push({ file, path, before: before[path]?.version || null, after: null })
  }
  const queries = focused.map(p => ({ package: { ecosystem: 'npm', name: p.name }, version: p.version }))
  const response = await fetch('https://api.osv.dev/v1/querybatch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ queries }), redirect: 'error', signal: AbortSignal.timeout(30_000) })
  assert.equal(response.ok, true, 'OSV verification failed')
  const results = await response.json()
  assert.equal(Array.isArray(results.results), true)
  assert.equal(results.results.length, queries.length)
  const evidence = { repository, base, preparationCommit: process.env.GITHUB_SHA, observedAt: new Date().toISOString(), focused, changes, advisoryResults: results.results, files: files.map(path => ({ path, baseBlob: sha(originals[path]), blob: sha(readFileSync(path, 'utf8')) })) }
  writeFileSync(`${output}/evidence.json`, `${JSON.stringify(evidence, null, 2)}\n`)
  writeFileSync(`${output}/changes.patch`, execFileSync('git', ['diff', '--', ...files], { encoding: 'utf8' }))
  console.log(JSON.stringify(evidence, null, 2))
  for (const r of results.results) {
    assert.ok(r && typeof r === 'object' && !Array.isArray(r))
    assert.ok(r.vulns === undefined || Array.isArray(r.vulns))
    assert.equal(r.next_page_token || '', '', 'Incomplete advisory coverage')
    assert.equal((r.vulns || []).length, 0, 'A focused dependency still has an advisory; do not publish candidate blobs')
  }
} else if (mode === 'upload-blobs') {
  validateDiff()
  const evidence = JSON.parse(readFileSync(`${output}/evidence.json`, 'utf8'))
  assert.equal(evidence.base, base)
  assert.equal(evidence.preparationCommit, process.env.GITHUB_SHA)
  assert.deepEqual(evidence.files.map(f => f.path), files)
  for (const r of evidence.advisoryResults) assert.ok(!r.next_page_token && !(r.vulns || []).length)
  const blobs = []
  for (const file of evidence.files) {
    const content = readFileSync(file.path, 'utf8')
    assert.equal(sha(content), file.blob)
    // Only unreachable blob objects are created. Branch writes and merge are
    // deliberately absent and must use the normal expected-head connector flow.
    const response = await fetch(`https://api.github.com/repos/${repository}/git/blobs`, {
      method: 'POST', headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json', 'X-GitHub-Api-Version': '2022-11-28' },
      body: JSON.stringify({ content, encoding: 'utf-8' }), redirect: 'error', signal: AbortSignal.timeout(30_000),
    })
    assert.equal(response.ok, true, `Blob upload failed: ${response.status}`)
    const result = await response.json()
    assert.equal(result.sha, file.blob)
    blobs.push({ path: file.path, sha: result.sha, baseBlob: file.baseBlob })
  }
  writeFileSync(`${output}/blobs.json`, `${JSON.stringify({ repository, base, preparationCommit: process.env.GITHUB_SHA, blobs }, null, 2)}\n`)
  console.log(JSON.stringify({ repository, base, preparationCommit: process.env.GITHUB_SHA, blobs }, null, 2))
} else throw new Error('Unsupported preparation mode')
