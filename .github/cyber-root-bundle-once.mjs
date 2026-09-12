// Temporary preparation only. No commit/ref, merge, deployment or app writes.
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
const repo = 'SignalBoost/signalboost-live'
const base = 'b9ae4191e536f372308dbd7dec41665afa9aa8ee'
const files = ['package.json', 'package-lock.json']
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim()
const blob = text => createHash('sha1').update(`blob ${Buffer.byteLength(text)}\0`).update(text).digest('hex')
assert.equal(process.env.GITHUB_REPOSITORY, repo)
assert.equal(process.env.GITHUB_REF, 'refs/heads/prep/cyber-root-patches-20260911')
assert.equal(git('rev-parse', 'HEAD'), process.env.GITHUB_SHA)
assert.equal(git('rev-parse', 'HEAD^'), base)
mkdirSync('.cyber-root-bundle', { recursive: true })
const out = '.cyber-root-bundle'
const mode = process.argv[2]
const checkDiff = () => assert.deepEqual(git('diff', '--name-only').split('\n').filter(Boolean).sort(), [...files].sort())
if (mode === 'prepare') {
  const originals = Object.fromEntries(files.map(path => [path, readFileSync(path, 'utf8')]))
  const before = JSON.parse(originals['package.json'])
  assert.equal(before.dependencies.next, '16.2.6')
  assert.equal(before.dependencies.postcss, '^8.4.31')
  execFileSync('npm', ['install', '--package-lock-only', '--ignore-scripts', '--no-audit', '--no-fund', '--save-exact', '--registry=https://registry.npmjs.org', 'next@16.3.5', 'postcss@8.5.23'], { stdio: 'inherit', timeout: 180_000 })
  const manifest = JSON.parse(readFileSync('package.json', 'utf8'))
  manifest.dependencies.postcss = before.dependencies.postcss
  const expected = structuredClone(before)
  expected.dependencies.next = '16.3.5'
  assert.deepEqual(manifest, expected)
  writeFileSync('package.json', `${JSON.stringify(manifest, null, 2)}\n`)
  const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'))
  lock.packages[''].dependencies.postcss = before.dependencies.postcss
  assert.equal(lock.packages[''].dependencies.next, '16.3.5')
  assert.equal(lock.packages['node_modules/next'].version, '16.3.5')
  assert.equal(lock.packages['node_modules/postcss'].version, '8.5.23')
  writeFileSync('package-lock.json', `${JSON.stringify(lock, null, 2)}\n`)
  checkDiff()
  const focused = []
  const changes = []
  const old = JSON.parse(originals['package-lock.json']).packages
  for (const [path, entry] of Object.entries(lock.packages)) {
    if (/(^|\/)node_modules\/(next|postcss)$/.test(path)) focused.push({ name: path.split('/').at(-1), version: entry.version, path })
    if (entry.version !== old[path]?.version) changes.push({ path, before: old[path]?.version || null, after: entry.version || null })
  }
  for (const path of Object.keys(old)) if (!Object.hasOwn(lock.packages, path)) changes.push({ path, before: old[path]?.version || null, after: null })
  const res = await fetch('https://api.osv.dev/v1/querybatch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ queries: focused.map(p => ({ package: { ecosystem: 'npm', name: p.name }, version: p.version })) }), redirect: 'error', signal: AbortSignal.timeout(30_000) })
  assert.equal(res.ok, true)
  const response = await res.json()
  assert.equal(Array.isArray(response.results), true)
  assert.equal(response.results.length, focused.length)
  for (const r of response.results) {
    assert.ok(r && typeof r === 'object' && !Array.isArray(r))
    assert.ok(r.vulns === undefined || Array.isArray(r.vulns))
    assert.equal(r.next_page_token || '', '')
    assert.equal((r.vulns || []).length, 0, 'Focused advisory remains; stop before upload')
  }
  const evidence = { repository: repo, base, preparationCommit: process.env.GITHUB_SHA, observedAt: new Date().toISOString(), focused, advisoryResults: response.results, changes, files: files.map(path => ({ path, baseBlob: blob(originals[path]), sha: blob(readFileSync(path, 'utf8')) })) }
  writeFileSync(`${out}/evidence.json`, `${JSON.stringify(evidence, null, 2)}\n`)
  writeFileSync(`${out}/changes.patch`, execFileSync('git', ['diff', '--', ...files], { encoding: 'utf8' }))
  console.log(JSON.stringify(evidence, null, 2))
} else if (mode === 'upload') {
  checkDiff()
  const evidence = JSON.parse(readFileSync(`${out}/evidence.json`, 'utf8'))
  assert.equal(evidence.base, base)
  assert.equal(evidence.preparationCommit, process.env.GITHUB_SHA)
  assert.deepEqual(evidence.files.map(f => f.path), files)
  for (const r of evidence.advisoryResults) assert.ok(!r.next_page_token && !(r.vulns || []).length)
  for (const file of evidence.files) {
    const content = readFileSync(file.path, 'utf8')
    assert.equal(blob(content), file.sha)
    const res = await fetch(`https://api.github.com/repos/${repo}/git/blobs`, { method: 'POST', headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' }, body: JSON.stringify({ content, encoding: 'utf-8' }), redirect: 'error', signal: AbortSignal.timeout(30_000) })
    assert.equal(res.ok, true)
    assert.equal((await res.json()).sha, file.sha)
  }
  writeFileSync(`${out}/blobs.json`, `${JSON.stringify(evidence.files, null, 2)}\n`)
  console.log(JSON.stringify({ repository: repo, base, blobs: evidence.files }, null, 2))
} else throw new Error('Unsupported mode')
