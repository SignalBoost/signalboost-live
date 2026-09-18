import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {
  COS_UNIVERSITY_PRODUCTION_OUTCOME_NAMESPACE,
  cosUniversityEvidenceSupply,
  isCosUniversityProductionOutcomeSource,
} from '../lib/ai/cos/cosUniversityEvidenceSupply.ts'

function file(relative: string): string {
  return fs.readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8')
}

test('a requirement with evidence arriving is unmet, not unsupplied', () => {
  assert.deepEqual(cosUniversityEvidenceSupply({ required: 1, earned: 0, observed: 12 }),
    { observed: 12, supplied: true, state: 'unmet' })
})

test('a requirement with no evidence of its kind anywhere is unsupplied', () => {
  assert.deepEqual(cosUniversityEvidenceSupply({ required: 1, earned: 0, observed: 0 }),
    { observed: 0, supplied: false, state: 'unsupplied' })
})

test('a satisfied requirement is met regardless of supply', () => {
  for (const observed of [0, 5]) {
    assert.equal(cosUniversityEvidenceSupply({ required: 1, earned: 1, observed }).state, 'met')
  }
  assert.equal(cosUniversityEvidenceSupply({ required: 0, earned: 0, observed: 0 }).state, 'met')
})

test('malformed counts degrade to the safe reading rather than throwing', () => {
  for (const input of [
    { required: -1, earned: 0, observed: 0 },
    { required: 1.5, earned: 0, observed: 0 },
    { required: Number.NaN, earned: Number.NaN, observed: Number.NaN },
  ]) {
    assert.doesNotThrow(() => cosUniversityEvidenceSupply(input))
  }
  assert.equal(cosUniversityEvidenceSupply({ required: 2, earned: -3, observed: 0 }).state, 'unsupplied')
})

test('the production namespace needs something after the prefix', () => {
  assert.equal(isCosUniversityProductionOutcomeSource('production_verified:language:pl:writing:msg-1'), true)
  assert.equal(isCosUniversityProductionOutcomeSource(COS_UNIVERSITY_PRODUCTION_OUTCOME_NAMESPACE), false)
  for (const value of ['', null, undefined, 'benchmark:x', 'capability_benchmark:reasoning']) {
    assert.equal(isCosUniversityProductionOutcomeSource(value as never), false)
  }
})

test('the owner board reports practical-evidence supply beside the blocker', () => {
  const route = file('app/api/admin/cos-university-masters/route.ts')
  assert.match(route, /practicalEvidenceSupply: cosUniversityEvidenceSupply\(\{/)
  // Existence only: one bounded row, never a second evidence reader that could invent credit.
  assert.match(route, /\.limit\(1\)/)
  assert.ok(!route.includes('recordHostCosUniversityMastersEvidence'))
})

test('the academic read path keeps its exact query set', () => {
  // Two suites execute cosUniversityMastersRuntime with injected ports and a hand-rolled query
  // builder. A reporting read added there would break every stub for no academic gain, so supply is
  // computed by the caller instead.
  const runtime = file('lib/ai/cos/cosUniversityMastersRuntime.ts')
  assert.ok(!runtime.includes('cosUniversityEvidenceSupply'))
  assert.ok(!runtime.includes('COS_UNIVERSITY_PRODUCTION_OUTCOME_NAMESPACE'))
})

test('verified Production supply has exactly one guarded application writer', () => {
  const root = new URL('../..', import.meta.url).pathname
  const skip = new Set(['node_modules', '.git', '.next', 'dist', 'build', 'coverage'])
  const writers: string[] = []
  const readerOrTest = /(?:tests\/|cosUniversityARange|cosUniversityLanguageARange|cosUniversityMastersProductionEvidence|cosUniversityEvidenceSupply)/
  const writeSeam = 'source: verifiedProductionTurnOutcomeSource(decision)'

  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (skip.has(entry.name)) continue
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) { walk(full); continue }
      if (!/\.(ts|tsx|mjs|js|sql)$/.test(entry.name)) continue
      const source = fs.readFileSync(full, 'utf8')
      if (!source.includes(writeSeam)) continue
      if (readerOrTest.test(full)) continue
      writers.push(full.slice(root.length))
    }
  }
  walk(path.join(root, 'saas'))
  assert.equal(writers.length, 1, `expected one governed writer, found: ${writers.join(', ')}`)
  assert.ok(writers[0]?.endsWith('saas/lib/ai/cos/cognitiveVerifiedOutcome.ts'))

  const writer = file('lib/ai/cos/cognitiveVerifiedOutcome.ts')
  assert.match(writer, /kind !== 'cos_turn_id'/)
  assert.match(writer, /Model\/Council output cannot be a verified COS production outcome source/)
  assert.match(writer, /source: verifiedProductionTurnOutcomeSource\(decision\)/)
})

test('every Master\'s track still requires real practical work', () => {
  const masters = file('lib/ai/cos/cosUniversityMasters.ts')
  assert.match(masters, /minimumDistinctPracticalPasses: [1-9]/)
  assert.match(masters, /if \(stage === 'verified_practical_work'\) return 'verified_production'/)
  assert.match(masters, /blockers\.push\('verified_practical_work_incomplete'\)/)
})