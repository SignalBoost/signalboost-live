import assert from 'node:assert/strict'
import test from 'node:test'
import { summarizeLabProviderOutcomes } from '../lib/lab/labProviderOutcomeSummary.ts'

const mk=(id:string,provider:string,stage:string,artifact=false)=>({
 runId:id,createdAt:'2026-10-16T12:00:00Z',teacherProviderKind:'openai',teacherModel:'teacher',
 baseModel:'base',computeProviderKind:provider,stage,
 artifactHash:artifact?'a'.repeat(64):null,artifactRevision:artifact?'rev':null,
})
test('run outcome counts reflect actual tenant-scoped metadata only',()=>{
 const result=summarizeLabProviderOutcomes([
  mk('one','together','completed',true),mk('two','together','failed'),
  mk('three','fireworks','cancelled'),mk('four','fireworks','training'),
 ])
 assert.deepEqual(result,[
  {provider:'fireworks',total:2,finished:0,failed:0,cancelled:1,running:1,artifacts:0},
  {provider:'together',total:2,finished:1,failed:1,cancelled:0,running:0,artifacts:1},
 ])
 assert.deepEqual(summarizeLabProviderOutcomes([]),[])
 assert.doesNotMatch(JSON.stringify(result),/quality|accuracy|credential|secret/)
})
