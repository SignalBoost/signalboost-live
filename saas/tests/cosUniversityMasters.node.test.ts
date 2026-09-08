// saas/tests/cosUniversityMasters.node.test.ts
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  COS_UNIVERSITY_MASTERS_TRACKS,
  cosUniversityMastersProgramKey,
  cosUniversityMastersTrackById,
  rankCosUniversityMastersTracks,
} from '../lib/ai/cos/cosUniversityMasters.ts'
import type { CosUniversitySubjectId } from '../lib/ai/cos/cosUniversity.ts'

test('five Master\'s tracks exist, each with a distinct id and a stable program key', () => {
  assert.equal(COS_UNIVERSITY_MASTERS_TRACKS.length, 5)
  const ids = COS_UNIVERSITY_MASTERS_TRACKS.map((track) => track.id)
  assert.equal(new Set(ids).size, 5)
  for (const track of COS_UNIVERSITY_MASTERS_TRACKS) {
    assert.equal(cosUniversityMastersProgramKey(track.id), `specialist_masters_${track.id}_v1`)
    assert.ok(track.coreSubjects.length > 0)
    assert.ok(track.requiredDepthPasses >= 1)
  }
})

test('cosUniversityMastersTrackById finds a real track and returns null for an unknown id', () => {
  assert.equal(cosUniversityMastersTrackById('applied_ai_systems')?.title, 'Applied AI Systems')
  assert.equal(cosUniversityMastersTrackById('not_a_real_track'), null)
})

test('ranking picks the track whose core subjects match the strongest undergraduate standing', () => {
  const standing = new Map<CosUniversitySubjectId, number>([
    ['cybersecurity', 6],
    ['computer_science', 5],
    ['statistics_data_science', 2],
    ['mathematics', 2],
  ])
  const ranked = rankCosUniversityMastersTracks(standing)
  assert.equal(ranked[0].track.id, 'security_and_trust')
  assert.ok(ranked[0].score > ranked[1].score)
})

test('ranking with no standing at all yields zero scores for every track, in stable catalog order', () => {
  const ranked = rankCosUniversityMastersTracks(new Map())
  assert.ok(ranked.every((entry) => entry.score === 0))
  assert.deepEqual(ranked.map((entry) => entry.track.id), COS_UNIVERSITY_MASTERS_TRACKS.map((t) => t.id))
})
