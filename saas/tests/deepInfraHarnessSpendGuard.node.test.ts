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
    'DEEPINFRA_MASS_EVALUATION_JUDGE_MAX_CALL_USD','DEEPINFRA_MASS_EVALUATION_JUDGE_MAX_RUN_USD',
  ],()=>{
    assert.equal(deepInfraMaxCallUsd('builder'),0.08)
    assert.equal(deepInfraMaxRunUsd('builder'),0.24)
    assert.equal(deepInfraMaxCallUsd('university_practice'),0.005)
    assert.equal(deepInfraMaxRunUsd('university_practice'),0.01)
    assert.equal(deepInfraMaxCallUsd('university_assessment'),0.10)
    assert.equal(deepInfraMaxRunUsd('university_assessment'),0.10)
    assert.equal(deepInfraMaxCallUsd('mass_evaluation_judge'),0.05)
    assert.equal(deepInfraMaxRunUsd('mass_evaluation_judge'),0.20)
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

function paidResponder(estimatedCost:number|null|undefined){
  let calls=0
  const fetch=async()=>{
    calls+=1
    return new Response(JSON.stringify({
      choices:[{message:{content:'ok'},finish_reason:'stop'}],
      usage:{prompt_tokens:1,completion_tokens:1,total_tokens:2,...(estimatedCost===undefined?{}:{estimated_cost:estimatedCost})},
    }),{status:200,headers:{'content-type':'application/json'}})
  }
  return {fetch,calls:()=>calls}
}

const paidCall=()=>callLocalModel({
  prompt:'fixture',maxTokens:16,persistUsage:false,maxEstimatedCostUsd:0.06,
  usageContext:{feature:'cos_interactive_answer'},
},CONFIG)

function boundedRun(runId:string,operation:()=>Promise<void>){
  return withHostProductionHarnessIngress({
    objective:'bounded paid retries',portableId:'test',agentId:'test',role:'test',
    capabilityId:'test.deepinfra',risk:'read',deadlineMs:5_000,maxToolCalls:6,maxConcurrency:1,
    maxCostUsd:0.10,runId,
  },operation)
}

test('without a reported cost the full reservation stays and the next paid call fails closed before fetch',async()=>{
  // Missing, null (Number(null) is 0; Codex on #4863) and non-numeric costs are unknown, never a release.
  for(const [name,cost] of [['missing',undefined],['null',null],['text','0.01']] as const){
    const priorFetch=globalThis.fetch
    const provider=paidResponder(cost as number|null|undefined)
    globalThis.fetch=provider.fetch as typeof fetch
    try{
      await boundedRun(`deepinfra-cost-unreported-${name}`,async()=>{
        assert.equal(await paidCall(),'ok')
        await assert.rejects(paidCall(),/harness_provider_cost_budget_exceeded/,name)
      })
      assert.equal(provider.calls(),1,`${name}: the denied retry must not reach DeepInfra`)
    }finally{
      globalThis.fetch=priorFetch
    }
  }
})

// Production 2026-10-24: Builder reserved $0.08 per call against $0.24 while calls cost about $0.02, so every
// work slice stopped after 3 calls. A reported cost replaces the reservation; the ceiling still bounds real spend.
test('a reported cost replaces the reservation and the ceiling bounds real spend',async()=>{
  const priorFetch=globalThis.fetch
  const provider=paidResponder(0.03)
  globalThis.fetch=provider.fetch as typeof fetch
  try{
    await boundedRun('deepinfra-cost-reported',async()=>{
      // 0.03 + 0.03 spent; each new call reserves 0.06 first: 0.06+0.06 > 0.10 refuses the third.
      assert.equal(await paidCall(),'ok')
      assert.equal(await paidCall(),'ok')
      await assert.rejects(paidCall(),/harness_provider_cost_budget_exceeded/)
    })
    assert.equal(provider.calls(),2)
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
  assert.match(builderPort,/maxEstimatedCostUsd: deepInfraMaxCallUsd\('builder'\)/)
  assert.match(builderJob,/maxCostUsd: deepInfraMaxRunUsd\('builder'\)/)
  assert.match(practice,/maxEstimatedCostUsd: deepInfraMaxCallUsd\('university_practice'\)/)
  assert.match(practice,/maxCostUsd: deepInfraMaxRunUsd\('university_practice'\)/)
  assert.match(exam,/maxEstimatedCostUsd: deepInfraMaxCallUsd/)
  assert.match(exam,/maxCostUsd: deepInfraMaxRunUsd/)
  assert.match(capstone,/maxEstimatedCostUsd: deepInfraMaxCallUsd\('university_assessment'\)/)
  assert.match(capstone,/maxCostUsd: deepInfraMaxRunUsd\('university_assessment'\)/)
})
