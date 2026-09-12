// saas/tests/cosUniversityLearningSourceCooldown.node.test.ts
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  DEFAULT_SOURCE_FAILURE_STREAK,
  cooledDownSourceIds,
  isSourceProbeCycle,
  sourceFailureStreaks,
  withoutCooledDownSources,
} from '../lib/ai/cos/cosUniversityLearningSourceCooldown.ts'

/** Newest first, as the loader reads them. Shapes copied from production source_errors. */
const productionRuns = [
  { youtube_metadata: 3, gdelt: 1 },
  { youtube_metadata: 3, gdelt: 1 },
  { youtube_metadata: 2 },
  { youtube_metadata: 3, gdelt: 1, crossref: 1 },
  { youtube_metadata: 3 },
]

function nonProbeSlot(): string {
  for (let minute = 0; minute < 600; minute += 1) {
    const slotKey = `2026-09-12T${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`
    if (!isSourceProbeCycle(slotKey)) return slotKey
  }
  throw new Error('no non-probe slot found')
}

test('an adapter failing in every recent cycle accumulates a streak', () => {
  const streaks = sourceFailureStreaks(productionRuns)
  assert.equal(streaks.get('youtube_metadata'), 5)
})

test('a cycle without that failure ends the streak, so an intermittent source is not cooled down', () => {
  const streaks = sourceFailureStreaks(productionRuns)
  // gdelt failed, failed, then did not fail in the third cycle.
  assert.equal(streaks.get('gdelt'), 2)
  assert.equal(streaks.get('crossref'), undefined)
})

test('only the persistent failure is skipped, on a non-probe cycle', () => {
  const cooled = cooledDownSourceIds({ runs: productionRuns, slotKey: nonProbeSlot() })
  assert.ok(cooled.has('youtube_metadata'))
  assert.ok(!cooled.has('gdelt'), 'an intermittent source must keep its turn')
  assert.ok(!cooled.has('crossref'))
})

test('a probe cycle re-admits everything so recovery needs no deploy', () => {
  const probe = ['2026-09-12T00:00', '2026-09-12T00:15', '2026-09-12T00:30', '2026-09-12T00:45', '2026-09-12T01:00']
    .find(slotKey => isSourceProbeCycle(slotKey, 4))
  assert.ok(probe, 'expected at least one probe slot in an hour at interval 4')
  assert.equal(cooledDownSourceIds({ runs: productionRuns, slotKey: probe, probeInterval: 4 }).size, 0)
})

test('a source below the streak threshold is never skipped', () => {
  const brief = Array.from({ length: DEFAULT_SOURCE_FAILURE_STREAK - 1 }, () => ({ gdelt: 1 }))
  assert.equal(cooledDownSourceIds({ runs: brief, slotKey: nonProbeSlot() }).size, 0)
})

test('adapters are filtered by id, and never all removed', () => {
  const adapters = [
    { kind: 'youtube_metadata', id: 'youtube_metadata' },
    { kind: 'reference', id: 'open_library' },
    { kind: 'news' },
  ]
  const kept = withoutCooledDownSources(adapters, new Set(['youtube_metadata']))
  assert.deepEqual(kept.map(adapter => adapter.id ?? adapter.kind), ['open_library', 'news'])

  // Acquiring from a failing source still beats acquiring from none.
  const all = withoutCooledDownSources(adapters, new Set(['youtube_metadata', 'open_library', 'news']))
  assert.equal(all.length, adapters.length)

  assert.deepEqual(withoutCooledDownSources(adapters, new Set()), adapters)
})

test('malformed recorded errors never cool a source down', () => {
  const streaks = sourceFailureStreaks([null, 'nope', { gdelt: 0 }, { gdelt: 'many' }])
  assert.equal(streaks.size, 0)
})
