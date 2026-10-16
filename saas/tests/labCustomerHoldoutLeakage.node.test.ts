import assert from 'node:assert/strict'
import test from 'node:test'
import { inspectHoldoutLeakage } from '../lib/lab/labCustomerHoldoutLeakage.ts'
const row=(prompt:string)=>JSON.stringify({prompt,response:'a'})
const held=(prompt:string)=>JSON.stringify({prompt,expected:'a',base:'a',trained:'a'})
test('blocks overlapping holdout and training prompt with whitespace/case normalization',()=>{
 const x=inspectHoldoutLeakage(row('  Hello   World'),held('hello world'))
 assert.equal(x.overlappingPrompts,1);assert.equal(x.safeToScore,false)
})
test('allows non-overlapping supplied examples but does not assert independence',()=>{
 const x=inspectHoldoutLeakage(row('training only'),held('holdout only'))
 assert.equal(x.overlappingPrompts,0);assert.equal(x.safeToScore,true)
})
test('refuses missing or malformed training inputs instead of claiming a clean holdout',()=>{
 assert.equal(inspectHoldoutLeakage('',held('q')).safeToScore,false)
 assert.equal(inspectHoldoutLeakage('{oops',held('q')).safeToScore,false)
 assert.equal(inspectHoldoutLeakage(row('p'),'{oops').safeToScore,false)
})


test('rejects repeated evaluation questions even when case and whitespace differ',()=>{
 const x=inspectHoldoutLeakage(row('training only'),[held('  Same   question '),held('same question')].join('\n'))
 assert.equal(x.evaluationPrompts,2)
 assert.equal(x.duplicateEvaluationPrompts,1)
 assert.equal(x.safeToScore,false)
})
