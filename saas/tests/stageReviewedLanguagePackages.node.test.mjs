import { test } from 'node:test'
import assert from 'node:assert/strict'
import { apply, flatten } from '../scripts/stage-reviewed-language-packages.mjs'
test('staging preserves nested source structures and arrays',()=>{
 const original={hello:'Hello {name}',group:{items:['a','b'],label:'Available'}}
 const flat=flatten(original)
 assert.deepEqual(Object.keys(flat),['hello','group.items','group.label'])
 const entries=Object.fromEntries(Object.entries(flat).map(([key,{source}])=>[key,{source,translation:key==='hello'?'Hallo {name}':source}]))
 assert.deepEqual(apply(original,entries),{hello:'Hallo {name}',group:{items:['a','b'],label:'Available'}})
 assert.deepEqual(original,{hello:'Hello {name}',group:{items:['a','b'],label:'Available'}})
})
