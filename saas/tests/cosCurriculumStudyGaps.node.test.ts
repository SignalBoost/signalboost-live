import assert from 'node:assert/strict'
import test from 'node:test'
import {
  COS_CORE_CURRICULUM_TRACKS,
  curriculumStudyItems,
  curriculumTrackStudyGaps,
} from '../lib/ai/cos/cosCurriculumPriority.ts'

test('every declared track contributes study items', () => {
  const items = curriculumStudyItems()
  assert.ok(items.length >= COS_CORE_CURRICULUM_TRACKS.length)
  for (const track of COS_CORE_CURRICULUM_TRACKS) {
    assert.ok(items.some(item => item.track.id === track.id), `${track.id} contributes no study topic`)
    assert.equal(items.filter(item => item.track.id === track.id).length, track.topics.length)
  }
  for (const item of items) assert.ok(item.topic.trim().length > 3)
})

test('study gaps are valid gaps the learning pipeline will accept', () => {
  const gaps = curriculumTrackStudyGaps({ cycleIndex: 0 })
  assert.equal(gaps.length, 6)
  const ids = new Set<string>()
  for (const gap of gaps) {
    assert.ok(gap.id.startsWith('curriculum:track:'))
    assert.equal(ids.has(gap.id), false, 'duplicate gap id')
    ids.add(gap.id)
    assert.ok(gap.subject.trim().length)
    assert.ok(gap.question.trim().length > 80)
    assert.deepEqual(gap.portableIds, ['cos'])
    assert.ok(Number.isFinite(gap.urgency) && gap.urgency > 0)
    assert.ok(gap.evidence.some(line => line.startsWith('curriculum_track=')))
    assert.ok(gap.evidence.some(line => line.startsWith('curriculum_safety_boundary=')))
  }
})

test('the question carries the track evaluation mode and safety boundary into the study itself', () => {
  const [gap] = curriculumTrackStudyGaps({ cycleIndex: 0, limit: 1 })
  const track = COS_CORE_CURRICULUM_TRACKS.find(item => gap.evidence.includes(`curriculum_track=${item.id}`))
  assert.ok(track)
  assert.ok(gap.question.includes(track.evaluation[0]))
  assert.ok(gap.question.includes(track.safetyBoundary))
})

test('the rotation is deterministic and eventually covers every topic', () => {
  assert.deepEqual(
    curriculumTrackStudyGaps({ cycleIndex: 3 }).map(gap => gap.id),
    curriculumTrackStudyGaps({ cycleIndex: 3 }).map(gap => gap.id),
  )
  assert.notDeepEqual(
    curriculumTrackStudyGaps({ cycleIndex: 0 }).map(gap => gap.id),
    curriculumTrackStudyGaps({ cycleIndex: 1 }).map(gap => gap.id),
  )

  const total = curriculumStudyItems().length
  const seen = new Set<string>()
  for (let cycle = 0; cycle < total; cycle += 1) {
    for (const gap of curriculumTrackStudyGaps({ cycleIndex: cycle })) seen.add(gap.id)
  }
  assert.equal(seen.size, total, 'rotation left topics that are never studied')
})

test('measured weakness is studied first and marked more urgent', () => {
  const gaps = curriculumTrackStudyGaps({
    cycleIndex: 0,
    prioritySubjects: ['outreach campaign conversion measurement'],
  })
  const commercial = COS_CORE_CURRICULUM_TRACKS.find(track => track.id === 'enterprise_commercial')
  assert.ok(commercial)
  const leading = gaps.slice(0, commercial.topics.length)
  for (const gap of leading) {
    assert.ok(gap.evidence.includes('curriculum_track=enterprise_commercial'))
    assert.equal(gap.urgency, 88)
  }
  assert.ok(gaps.some(gap => !gap.evidence.includes('curriculum_track=enterprise_commercial')) || gaps.length <= commercial.topics.length)
})

test('an unusable cycle index or limit still produces a usable bounded study set', () => {
  assert.equal(curriculumTrackStudyGaps({ cycleIndex: -7 }).length, 6)
  assert.equal(curriculumTrackStudyGaps({ limit: 0 }).length, 6)
  assert.equal(curriculumTrackStudyGaps({ limit: 999 }).length, 24)
  assert.equal(curriculumTrackStudyGaps({ now: new Date('not a date') }).length, 6)
})
