import assert from 'node:assert/strict'
import test from 'node:test'
import { COS_CORE_CURRICULUM_TRACKS } from '../lib/ai/cos/cosCurriculumPriority.ts'
test('ML data curriculum includes AutoML and XAI safeguards',()=>{const t=COS_CORE_CURRICULUM_TRACKS.find(x=>x.id==='ml_data_engineering');assert.ok(t);assert.ok(t.topics.some(x=>/AutoML/i.test(x)));assert.ok(t.topics.some(x=>/explainable AI/i.test(x)));assert.match(t.safetyBoundary,/AutoML scores.*never prove fairness.*legal compliance/i)})
