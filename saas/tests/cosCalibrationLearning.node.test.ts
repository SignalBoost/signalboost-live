import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { buildCalibrationCohorts } from '../lib/ai/cos/answerConfidenceCalibration.ts'
test('cohort calibration stays shadow-only',()=>{const rows=Array.from({length:30},(_,i)=>({predicted:i%2?.8:.2,observed:i%2===1,problemClass:'database',reasonerLabel:'local',evidenceRegime:'learned_corpus'}));const cohort=buildCalibrationCohorts(rows)[0];assert.equal(cohort.shadowRecommendation.eligible,false);assert.match(cohort.shadowRecommendation.reason,/Shadow-only|No threshold/i)})
test('owner route is read-only and does not change live policy',()=>{const route=readFileSync(new URL('../app/api/admin/cos-calibration-learning/route.ts',import.meta.url),'utf8'),store=readFileSync(new URL('../lib/ai/cos/calibrationLearningStore.ts',import.meta.url),'utf8');assert.match(route,/requireOwner\(\)/);assert.doesNotMatch(route,/export async function POST/);assert.match(store,/livePolicyChanged:false/)})
