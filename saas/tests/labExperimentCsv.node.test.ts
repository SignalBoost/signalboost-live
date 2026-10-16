import assert from 'node:assert/strict'
import test from 'node:test'
import { buildLabExperimentCsv, LAB_EXPERIMENT_CSV_COLUMNS } from '../lib/lab/labExperimentCsv.ts'

const run=(id:string,provider:string,model:string)=>({
 runId:id,createdAt:'2026-10-16T12:00:00Z',stage:'completed',
 teacherProviderKind:'openai',teacherModel:'teacher',computeProviderKind:provider,
 baseModel:model,artifactRepo:'customer/a',artifactRevision:'rev',
})
test('exports compatible CSV with provider/status filters and stable columns',()=>{
 const result=buildLabExperimentCsv([run('one','together','base'),run('two','fireworks','base2')],{provider:'together',status:'FINISHED'})
 assert.ok(result.startsWith(LAB_EXPERIMENT_CSV_COLUMNS.join(',')+'\r\n'))
 assert.match(result,/"one"/)
 assert.doesNotMatch(result,/"two"/)
 assert.match(result,/"customer\/a"/)
})
test('rejects spreadsheet formulas and escapes line breaks and double quotes',()=>{
 const result=buildLabExperimentCsv([run('safe','together',' =HYPERLINK("http://bad")\nnext')])
 assert.ok(result.includes(`"' =HYPERLINK(""http://bad"")\nnext"`))
 assert.doesNotMatch(result,/" =HYPERLINK/)
})
test('no fabricated quality or spending metrics in export',()=>{
 assert.deepEqual(LAB_EXPERIMENT_CSV_COLUMNS.includes('quality' as never),false)
 assert.doesNotMatch(buildLabExperimentCsv([run('one','together','base')]),/credential|api_key|accuracy|quality_score|price/)
})
