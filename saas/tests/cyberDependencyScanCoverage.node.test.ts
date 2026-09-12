// saas/tests/cyberDependencyScanCoverage.node.test.ts
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const file = (relative: string) => fs.readFileSync(path.resolve(import.meta.dirname, '..', relative), 'utf8')
const scanner = () => file('lib/cyber/dependencyScanner.ts')
const repoTarget = () => file('lib/audit/repoTarget.ts')

test('manifests are read whole, so a real lockfile is parsed instead of silently dropped', () => {
  const target = repoTarget()
  // The ordinary read cap is unchanged for every other caller.
  assert.match(target, /const MAX_FILE_CHARS = 50000/)
  assert.match(target, /export const MAX_MANIFEST_FILE_CHARS = 4_000_000/)
  assert.match(target, /options\?: \{ maxChars\?: number \}/)
  assert.match(target, /const limit = Math\.max\(1, Math\.floor\(Number\(options\?\.maxChars\) \|\| MAX_FILE_CHARS\)\)/)
  assert.match(target, /const truncated = text\.length > limit/)
  assert.match(target, /content: truncated \? text\.slice\(0, limit\) : text/)
  assert.doesNotMatch(target, /text\.slice\(0, MAX_FILE_CHARS\)/, 'the hard-coded cap must not remain in the read path')

  const source = scanner()
  assert.match(source, /readRepoFileFrom\(target\.repo, target\.branch, file, \{ maxChars: MAX_MANIFEST_FILE_CHARS \}\)/)
  // This repo's own lockfile is the case that used to be dropped.
  const lockChars = file('package-lock.json').length
  assert.ok(lockChars > 50000, 'the lockfile is larger than the ordinary read cap')
  assert.ok(lockChars < 4_000_000, 'the lockfile fits inside the manifest cap')
})

test('an unreadable or unparsable manifest is recorded, never skipped in silence', () => {
  const source = scanner()
  assert.match(source, /if \(!res\.ok \|\| !res\.content \|\| res\.truncated\) \{ unreadableManifests\.push\(file\); continue \}/)
  // A lockfile that parses to nothing is the silent-failure shape that produced an empty inventory.
  assert.match(source, /if \(out\.size === before && file\.endsWith\('package-lock\.json'\)\) unreadableManifests\.push\(file\)/)
  assert.match(source, /unreadableManifests: string\[\]; capped: boolean/)
})

test('the report states its own coverage instead of implying a complete scan', () => {
  const source = scanner()
  assert.match(source, /coverage\?: \{\s*complete: boolean/)
  assert.match(source, /const complete = unreadableManifests\.length === 0 && !capped/)
  assert.match(source, /capped: out\.size > maxPackages/)
  assert.match(source, /note: complete \? undefined :/)
  assert.match(source, /These findings cover part of the dependency tree, not all of it\./)
  // Coverage is computed from the collection result and returned with every successful report.
  const buildAt = source.indexOf('const coverage = buildCoverage(collected.unreadableManifests, collected.capped, maxPackages)')
  const returnAt = source.indexOf('return { ok: true, generatedAt', buildAt)
  assert.ok(buildAt > 0 && returnAt > buildAt)
  assert.match(source.slice(returnAt, returnAt + 400), /summary: summarize\(collected\.packages, advisories\), coverage \}/)
})
