import assert from 'node:assert/strict'
import test from 'node:test'
import { COS_CORE_CURRICULUM_TRACKS, coreCurriculumTrackForSubject } from '../lib/ai/cos/cosCurriculumPriority.ts'
test('cognitive science track is privacy bounded',()=>{const t=COS_CORE_CURRICULUM_TRACKS.find(x=>x.id==='cognitive_science');assert.ok(t);assert.match(t.safetyBoundary,/No mental-state inference.*diagnosis.*profiling/i);assert.equal(coreCurriculumTrackForSubject('cognitive load and human-agent collaboration')?.id,'cognitive_science')})
