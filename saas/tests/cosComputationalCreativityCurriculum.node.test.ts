import assert from 'node:assert/strict'
import test from 'node:test'
import { COS_CORE_CURRICULUM_TRACKS, coreCurriculumTrackForSubject } from '../lib/ai/cos/cosCurriculumPriority.ts'
test('creative curriculum preserves human authorship and rights boundaries',()=>{const t=COS_CORE_CURRICULUM_TRACKS.find(x=>x.id==='computational_creativity');assert.ok(t);assert.match(t.safetyBoundary,/Disclose.*AI.*respect rights.*do not impersonate.*humans retain final/i);assert.equal(coreCurriculumTrackForSubject('music authorship and copyright')?.id,'computational_creativity')})
