// saas/tests/massEvaluationJudgeSpendReservation.node.test.ts
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { callLocalModel } from '../lib/ai/local-inference.ts'
import { deepInfraMaxCallUsd, deepInfraMaxRunUsd, massEvaluationHarnessMaxCostUsd } from '../lib/ai/cos/deepInfraSpendPolicy.ts'
import { MASS_EVALUATION_JUDGE_CALLS } from '../lib/ai/cos/cosUniversityMassEvaluationContextBudget.ts'
import { withHostProductionHarnessIngress } from '../platform-harness/runtime/host-ingress.ts'

const CONFIG = {
  baseUrl: 'https://api.deepinfra.com/v1/openai',
  model: 'fixture/deepinfra-judge',
  apiKey: 'fixture',
  timeoutMs: 2_000,
  provider: 'deepinfra',
} as const
const WAKE_USD = 0.2
const evaluation = readFileSync(new URL('../lib/ai/cos/cosUniversityMassDistilledArtifactEvaluation.ts', import.meta.url), 'utf8')

function withClearedEnv<T>(run:()=>T):T {
  const names=['DEEPINFRA_MASS_EVALUATION_JUDGE_MAX_CALL_USD','DEEPINFRA_MASS_EVALUATION_JUDGE_MAX_RUN_USD']
  const prior=Object.fromEntries(names.map(name=>[name,process.env[name]]))
  for(const name of names)delete process.env[name]
  try{return run()}finally{
    for(const name of names){
      const value=prior[name]
      if(value===undefined)delete process.env[name]
      else process.env[name]=value
    }
  }
}

test('judge reservation defaults cover every judge call of one evaluation run', () => {
  withClearedEnv(() => {
    assert.equal(MASS_EVALUATION_JUDGE_CALLS, 4)
    assert.equal(deepInfraMaxCallUsd('mass_evaluation_judge'), 0.05)
    assert.equal(deepInfraMaxRunUsd('mass_evaluation_judge'), 0.20)
    assert.ok(deepInfraMaxRunUsd('mass_evaluation_judge') + Number.EPSILON >= deepInfraMaxCallUsd('mass_evaluation_judge') * MASS_EVALUATION_JUDGE_CALLS)
    assert.equal(massEvaluationHarnessMaxCostUsd(WAKE_USD, MASS_EVALUATION_JUDGE_CALLS), 0.4)
    assert.throws(() => massEvaluationHarnessMaxCostUsd(WAKE_USD, 5), /deepinfra_run_ceiling_below_judge_calls/)
  })
})

test('all judge calls of one evaluation reserve successfully inside the evaluation Harness ceiling', async () => {
  const priorFetch=globalThis.fetch
  let calls=0
  globalThis.fetch=async()=>{
    calls+=1
    return new Response(JSON.stringify({
      choices:[{message:{content:'{"cases":[]}'},finish_reason:'stop'}],
      usage:{prompt_tokens:1,completion_tokens:1,total_tokens:2,estimated_cost:0.001},
    }),{status:200,headers:{'content-type':'application/json'}})
  }
  try{
    await withClearedEnv(() => withHostProductionHarnessIngress({
      objective:'mass evaluation judge reservations',portableId:'cos-university-evaluator',agentId:'test',role:'independent_evaluator',
      capabilityId:'university.evaluation.execute',risk:'write',deadlineMs:5_000,maxToolCalls:12,maxConcurrency:1,
      maxCostUsd:massEvaluationHarnessMaxCostUsd(WAKE_USD, MASS_EVALUATION_JUDGE_CALLS),runId:'mass-eval-judge-reservation',
    },async()=>{
      for(let index=0;index<MASS_EVALUATION_JUDGE_CALLS;index+=1){
        const result=await callLocalModel({
          prompt:'fixture',maxTokens:16,persistUsage:false,
          usageContext:{feature:'mass_distilled_independent_evaluation',purpose:'independent_assessment'},
          maxEstimatedCostUsd:deepInfraMaxCallUsd('mass_evaluation_judge'),
        },CONFIG)
        assert.equal(result,'{"cases":[]}')
      }
    }))
    assert.equal(calls,MASS_EVALUATION_JUDGE_CALLS)
  }finally{
    globalThis.fetch=priorFetch
  }
})

test('the evaluator judge reserves per call and the evaluation run carries the total paid ceiling', () => {
  assert.match(evaluation, /maxEstimatedCostUsd:deepInfraMaxCallUsd\('mass_evaluation_judge'\)/)
  assert.match(evaluation, /maxCostUsd: massEvaluationHarnessMaxCostUsd\(input\.claim\.maxEstimatedRuntimeWakeCostUsd, JUDGE_CALLS\)/)
  assert.doesNotMatch(evaluation, /maxCostUsd: input\.claim\.maxEstimatedRuntimeWakeCostUsd,/)
})
