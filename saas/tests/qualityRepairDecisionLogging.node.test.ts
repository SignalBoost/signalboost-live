import assert from 'node:assert/strict'
import test from 'node:test'
import { recordQualityRepairDecision } from '../lib/ai/cos/reasonerQuality.ts'
test('quality repair audit persistence is a no-op without a COS service DB', async()=>{
  await assert.doesNotReject(recordQualityRepairDecision({repairKind:'quality_repair',reasonerLabel:'independent-local:test',accepted:true,details:{note:'test'}}))
})
test('skill citation repair audit is also accepted',async()=>{
  await assert.doesNotReject(recordQualityRepairDecision({repairKind:'skill_citation_repair',reasonerLabel:'independent-local:test',accepted:false,details:{}}))
})
