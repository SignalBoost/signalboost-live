// saas/tests/deepInfraHarnessSpendGuard.node.test.ts
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { callLocalModel } from '../lib/ai/local-inference.ts'
import {
  deepInfraMaxCallUsd,
  deepInfraMaxRunUsd,
} from '../lib/ai/cos/deepInfraSpendPolicy.ts'
import { withHostProductionHarnessIngress } from '../platform-harness/runtime/host-ingress.ts'

const CONFIG = {
  baseUrl: 'https://api.deepinfra.com/v1/openai',
  model: 'fixture/deepinfra-model',
  apiKey: 'fixture',
  timeoutMs: 2_000,
  provider: 'deepinfra',
} as const

function source(path:string):string {
  return readFileSync(new URL(`../${path}`,import.meta.url),'utf8')
}

function withClearedEnv(names:readonly string[],run:()=>void):void {
  const prior=Object.fromEntries(names.map(name=>[name,process.env[name]]))
  for(const name of names)delete process.env[name]
  try{run()}finally{
    for(const name of names){
      const value=prior[name]
      if(value===undefined)delete process.env[name]
      else process.env[name]=value
    }
  }
}

test('default DeepInfra reservations are conservative and run ceilings cannot undercut one call',()=>{
  withClearedEnv([
    'DEEPINFRA_BUILDER_MAX_CALL_USD','DEEPINFRA_BUILDER_MAX_JOB_USD',
    'DEEPINFRA_UNIVERSITY_PRACTICE_MAX_CALL_USD','DEEPINFRA_UNIVERSITY_PRACTICE_MAX_RUN_USD',
    'DEEPINFRA_UNIVERSITY_ASSESSMENT_MAX_CALL_USD','DEEPINFRA_UNIVERSITY_ASSESSMENT_MAX_RUN_USD',
    'DEEPINFRA_MASS_EVALUATION_MAX_CALL_USD','DEEPINFRA_MASS_EVALUATION_MAX_RUN_USD',
  ],()=>{
    assert.equal(deepInfraMaxCallUsd('builder'),0.08)
    assert.equal(deepInfraMaxRunUsd('builder'),0.24)
    assert.equal(deepInfraMaxCallUsd('university_practice'),0.005)
    assert.equal(deepInfraMaxRunUsd('university_practice'),0.01)
    assert.equal(deepInfraMaxCallUsd('university_assessment'),0.10)
    assert.equal(deepInfraMaxRunUsd('university_assessment'),0.10)
    assert.equal(deepInfraMaxCallUsd('mass_distilled_evaluation'),0.10)
    assert.equal(deepInfraMaxRunUsd('mass_distilled_evaluation'),0.40)
  })
})

test('DeepInfra inside a cost-bounded host HarnessRun requires a pre-call reservation',async()=>{
  await assert.rejects(
    withHostProductionHarnessIngress({
      objective:'cost reservation required',portableId:'test',agentId:'test',role:'test',
      capabilityId:'test.deepinfra',risk:'read',deadlineMs:5_000,maxToolCalls:2,maxConcurrency:1,
      maxCostUsd:0.10,runId:'deepinfra-cost-required',
    },()=>callLocalModel({
      prompt:'fixture',maxTokens:16,persistUsage:false,
      usageContext:{feature:'cos_interactive_answer'},
    },CONFIG)),
    /deepinfra_harness_cost_reservation_required/,
  )
})

test('retries consume reserved budget and the second paid call fails closed before fetch',async()=>{
  const priorFetch=globalThis.fetch
  let calls=0
  globalThis.fetch=async()=>{
    calls+=1
    return new Response(JSON.stringify({
      choices:[{message:{content:'ok'},finish_reason:'stop'}],
      usage:{prompt_tokens:1,completion_tokens:1,total_tokens:2,estimated_cost:0.001},
    }),{status:200,headers:{'content-type':'application/json'}})
  }
  try{
    await withHostProductionHarnessIngress({
      objective:'bounded paid retries',portableId:'test',agentId:'test',role:'test',
      capabilityId:'test.deepinfra',risk:'read',deadlineMs:5_000,maxToolCalls:3,maxConcurrency:1,
      maxCostUsd:0.10,runId:'deepinfra-cost-bounded',
    },async()=>{
      const first=await callLocalModel({
        prompt:'fixture',maxTokens:16,persistUsage:false,maxEstimatedCostUsd:0.06,
        usageContext:{feature:'cos_interactive_answer'},
      },CONFIG)
      assert.equal(first,'ok')
      await assert.rejects(
        callLocalModel({
          prompt:'fixture',maxTokens:16,persistUsage:false,maxEstimatedCostUsd:0.06,
          usageContext:{feature:'cos_interactive_answer'},
        },CONFIG),
        /harness_provider_cost_budget_exceeded/,
      )
    })
    assert.equal(calls,1,'the denied retry must not reach DeepInfra')
  }finally{
    globalThis.fetch=priorFetch
  }
})

test('Builder and University paid paths carry both per-call reservations and Harness run ceilings',()=>{
  const builderPort=source('lib/cos/aiPort.ts')
  const builderJob=source('lib/builder/job-runner.ts')
  const practice=source('lib/ai/cos/cosUniversityPracticeExecution.ts')
  const exam=source('lib/ai/cos/cosUniversityAgentExamRuntime.ts')
  const capstone=source('lib/ai/cos/cosUniversityAgentCapstoneRuntime.ts')
  const massEval=source('lib/ai/cos/cosUniversityMassDistilledArtifactEvaluation.ts')
  assert.match(builderPort,/maxEstimatedCostUsd: deepInfraMaxCallUsd\('builder'\)/)
  assert.match(builderJob,/maxCostUsd: deepInfraMaxRunUsd\('builder'\)/)
  assert.match(practice,/maxEstimatedCostUsd: deepInfraMaxCallUsd\('university_practice'\)/)
  assert.match(practice,/maxCostUsd: deepInfraMaxRunUsd\('university_practice'\)/)
  assert.match(exam,/maxEstimatedCostUsd: deepInfraMaxCallUsd/)
  assert.match(exam,/maxCostUsd: deepInfraMaxRunUsd/)
  assert.match(capstone,/maxEstimatedCostUsd: deepInfraMaxCallUsd\('university_assessment'\)/)
  assert.match(capstone,/maxCostUsd: deepInfraMaxRunUsd\('university_assessment'\)/)
  assert.match(massEval,/maxEstimatedCostUsd:deepInfraMaxCallUsd\('mass_distilled_evaluation'\)/)
  assert.match(massEval,/maxCostUsd: deepInfraMaxRunUsd\('mass_distilled_evaluation'\)/)
})
