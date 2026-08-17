import assert from 'node:assert/strict'
import test from 'node:test'
import { COS_CORE_CURRICULUM_TRACKS, coreCurriculumTrackForSubject } from '../lib/ai/cos/cosCurriculumPriority.ts'
test('COS curriculum includes ML/data and AI systems/safety tracks',()=>{
 assert.deepEqual(COS_CORE_CURRICULUM_TRACKS.map(x=>x.id),['cyber_defense','software_engineering','ml_data_engineering','ai_systems_safety','agent_systems'])
 assert.equal(coreCurriculumTrackForSubject('dataset quality and embedding evaluation')?.id,'ml_data_engineering')
 assert.equal(coreCurriculumTrackForSubject('GPU inference capacity observability')?.id,'ai_systems_safety')
})
