import assert from 'node:assert/strict'
import test from 'node:test'
import { COS_CORE_CURRICULUM_TRACKS, coreCurriculumTrackForSubject } from '../lib/ai/cos/cosCurriculumPriority.ts'
test('space and applied physics tracks are bounded to research and simulation',()=>{const s=COS_CORE_CURRICULUM_TRACKS.find(x=>x.id==='space_science');const a=COS_CORE_CURRICULUM_TRACKS.find(x=>x.id==='applied_physics');assert.ok(s&&a);assert.match(s.safetyBoundary,/No real spacecraft.*mission control/i);assert.match(a.safetyBoundary,/No medical diagnosis.*safety-critical deployment/i);assert.equal(coreCurriculumTrackForSubject('orbital gravity simulation')?.id,'space_science');assert.equal(coreCurriculumTrackForSubject('quantum photonics research')?.id,'applied_physics')})
