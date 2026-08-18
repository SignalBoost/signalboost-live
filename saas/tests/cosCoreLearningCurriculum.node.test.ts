import assert from 'node:assert/strict'
import test from 'node:test'
import { COS_CORE_CURRICULUM_TRACKS, coreCurriculumTrackForSubject } from '../lib/ai/cos/cosCurriculumPriority.ts'
test('core curriculum defines cyber defense coding and agent tracks',()=>{
 const ids=COS_CORE_CURRICULUM_TRACKS.map(track=>track.id)
 assert.equal(new Set(ids).size,ids.length)
 for(const id of ['cyber_defense','software_engineering','agent_systems'])assert.ok(ids.includes(id))
 assert.equal(coreCurriculumTrackForSubject('cloud security incident triage')?.id,'cyber_defense')
 assert.equal(coreCurriculumTrackForSubject('TypeScript API debugging')?.id,'software_engineering')
 assert.equal(coreCurriculumTrackForSubject('RAG agent planning')?.id,'agent_systems')
})
test('every core track has evaluations and a safety boundary',()=>{for(const track of COS_CORE_CURRICULUM_TRACKS){assert.ok(track.evaluation.length);assert.ok(track.safetyBoundary.length)}})
