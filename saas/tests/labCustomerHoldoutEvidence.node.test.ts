import assert from 'node:assert/strict'
import test from 'node:test'
import { customerHoldoutEvidence } from '../lib/lab/labCustomerHoldoutEvidence.ts'
const score={total:2,baseCorrect:1,trainedCorrect:2,baseAccuracy:.5,trainedAccuracy:1,delta:.5}
const leakage={trainingPrompts:3,evaluationPrompts:2,overlappingPrompts:0,invalidTrainingLines:0,invalidHoldoutLines:0,safeToScore:true}
test('evidence explicitly identifies self-reported no-inference method without raw prompts',()=>{
 const result=customerHoldoutEvidence({runId:'r1',baseModel:'org/base',trainedModel:'org/tuned',score,leakage})
 assert.equal(result.execution,'no_provider_inference_performed')
 assert.equal(result.provenance,'customer_supplied_not_independently_verified')
 assert.equal(result.trainingRunId,'r1')
 assert.equal(result.delta,.5)
 assert.equal(JSON.stringify(result).includes('rawOutputs'),false)
})
test('no evidence without a clean overlap check or named trained artifact',()=>{
 assert.throws(()=>customerHoldoutEvidence({runId:'r1',baseModel:'org/base',trainedModel:'org/tuned',score,leakage:{...leakage,safeToScore:false}}),/unverified/)
 assert.throws(()=>customerHoldoutEvidence({runId:'r1',baseModel:'org/base',trainedModel:'',score,leakage}),/model_missing/)
 assert.throws(()=>customerHoldoutEvidence({runId:'r1',baseModel:'org/base',trainedModel:'org/tuned',score,leakage:{...leakage,evaluationPrompts:3}}),/unverified/)
})
