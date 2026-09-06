import assert from 'node:assert/strict'
import test from 'node:test'
import { routeSpecialistLearning, specialistCompetencySnapshot } from '../lib/ai/cos/specialistLearning.ts'

test('routes software material to deeper curricula while COS remains orchestrator', () => {
  const route = routeSpecialistLearning({
    topic: 'Debugging TypeScript deployment failures',
    studyIntent: 'Practice regression tests and root-cause repair in CI/CD.',
  })
  assert.equal(route.orchestrator, 'cos')
  assert.equal(route.specialistFamily, 'software')
  assert.equal(route.authorityGranted, false)
  assert.deepEqual(route.curriculumTracks, ['software.debugging', 'software.testing', 'software.delivery', 'software.development'])
})

test('keeps broadly relevant non-software material in general COS study', () => {
  const route = routeSpecialistLearning({ topic: 'Portuguese prose', studyIntent: 'Improve narrative rhythm and vocabulary.' })
  assert.equal(route.specialistFamily, null)
  assert.deepEqual(route.curriculumTracks, [])
})

test('reports specialist competency from lifecycle evidence without promoting skills', () => {
  const now = Date.parse('2026-09-06T00:00:00.000Z')
  const snapshot = specialistCompetencySnapshot('software', [
    { status: 'encountered', metadata: { specialistFamily: 'software', curriculumTracks: ['software.development'] } },
    { status: 'validated', last_validated_at: '2026-09-01T00:00:00.000Z', procedure: { specialistFamily: 'software', curriculumTracks: ['software.testing'] } },
    { status: 'mastered', last_validated_at: '2026-06-01T00:00:00.000Z', metadata: { specialistFamily: 'software', curriculumTracks: ['software.debugging'] } },
    { status: 'learned', metadata: { specialistFamily: 'marketing' } },
  ], { nowMs: now, freshnessDays: 30 })

  assert.equal(snapshot.totalSkills, 3)
  assert.equal(snapshot.lifecycleCounts.encountered, 1)
  assert.equal(snapshot.lifecycleCounts.validated, 1)
  assert.equal(snapshot.lifecycleCounts.mastered, 1)
  assert.equal(snapshot.freshValidatedSkills, 1)
  assert.equal(snapshot.staleValidatedSkills, 1)
  assert.equal(snapshot.curriculumCounts['software.testing'], 1)
})
