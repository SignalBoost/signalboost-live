import assert from 'node:assert/strict'
import test from 'node:test'
import { scoreCustomerHoldout } from '../lib/lab/labCustomerHoldoutScore.ts'
const row=(prompt:string, expected:string, base:string, trained:string)=>JSON.stringify({prompt,expected,base,trained})
test('scores exact-match held-out outputs without inferring model quality',()=>{
 const s=scoreCustomerHoldout([row('q1','4','5','4'),row('q2','Blue','blue','red')].join('\n'))
 assert.deepEqual(s,{total:2,baseCorrect:1,trainedCorrect:1,baseAccuracy:.5,trainedAccuracy:.5,delta:0})
})
test('requires uniquely identified prompts and all actual expected and observed outputs',()=>{
 assert.throws(()=>scoreCustomerHoldout(''),/holdout_count_invalid/)
 assert.throws(()=>scoreCustomerHoldout([row('q','x','x','x'),row('q','x','x','x')].join('\n')), /holdout_prompt_duplicate/)
 assert.throws(()=>scoreCustomerHoldout('{"prompt":"q","expected":"x","base":"x"}'),/holdout_row_invalid/)
 assert.throws(()=>scoreCustomerHoldout('{broken'),/holdout_json_invalid/)
})
test('rejects oversized or excessive evaluation sets',()=>{
 assert.throws(()=>scoreCustomerHoldout(row('q','x','x','x'.repeat(20001))),/holdout_row_invalid/)
 assert.throws(()=>scoreCustomerHoldout(Array.from({length:129},(_,i)=>row('q'+i,'x','x','x')).join('\n')),/holdout_count_invalid/)
})
