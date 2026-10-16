import assert from 'node:assert/strict'
import test from 'node:test'
import { buildManualComparisonEvidence } from '../lib/lab/labManualComparisonEvidence.ts'
const sample={runId:'12345678-1234-1234-1234-123456789abc',baseModel:'base/model',trainedModel:'trained/model',prompt:'What is 2+2?',baseResponse:'5',trainedResponse:'4',vote:'trained' as const}
test('exports provider-neutral, explicitly unverified manual comparison',()=>{
 const e=buildManualComparisonEvidence(sample)
 assert.equal(e.schema,'itmounts.manual-response-comparison.v1')
 assert.equal(e.verification,'not-independent')
 assert.equal(e.runId,sample.runId)
 assert.equal(e.responses.trained,'4')
 assert.equal(e.vote,'trained')
})
test('rejects empty, invalid or oversized comparisons',()=>{
 assert.throws(()=>buildManualComparisonEvidence({...sample,prompt:' '}),/responses_required/)
 assert.throws(()=>buildManualComparisonEvidence({...sample,runId:'other'}),/run_id_invalid/)
 assert.throws(()=>buildManualComparisonEvidence({...sample,prompt:'x'.repeat(4001)}),/comparison_too_long/)
 assert.throws(()=>buildManualComparisonEvidence({...sample,vote:'invented' as any}),/vote_invalid/)
})
