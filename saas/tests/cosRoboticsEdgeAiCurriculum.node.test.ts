import assert from 'node:assert/strict'
import test from 'node:test'
import { COS_CORE_CURRICULUM_TRACKS, coreCurriculumTrackForSubject } from '../lib/ai/cos/cosCurriculumPriority.ts'
test('robotics curriculum is simulation-only and safety-bounded',()=>{const t=COS_CORE_CURRICULUM_TRACKS.find(x=>x.id==='robotics_edge_ai');assert.ok(t);assert.match(t.safetyBoundary,/Simulation and recorded datasets only.*No weaponization.*No.*drone control/i);assert.equal(coreCurriculumTrackForSubject('LiDAR drone sensor fusion')?.id,'robotics_edge_ai')})
