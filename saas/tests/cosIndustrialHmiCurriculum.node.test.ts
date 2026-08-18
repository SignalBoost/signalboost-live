import assert from 'node:assert/strict'
import test from 'node:test'
import { COS_CORE_CURRICULUM_TRACKS, coreCurriculumTrackForSubject } from '../lib/ai/cos/cosCurriculumPriority.ts'
test('industrial HMI curriculum requires operator and emergency controls',()=>{const t=COS_CORE_CURRICULUM_TRACKS.find(x=>x.id==='industrial_hmi');assert.ok(t);assert.match(t.safetyBoundary,/No direct PLC.*authorized engineers.*rollback.*emergency-stop/i);assert.equal(coreCurriculumTrackForSubject('SCADA alarm and PLC dashboard')?.id,'industrial_hmi')})
