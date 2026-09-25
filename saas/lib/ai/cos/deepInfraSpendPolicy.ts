// saas/lib/ai/cos/deepInfraSpendPolicy.ts
//
// Host-owned spend ceilings for paid DeepInfra fallback/training/assessment calls.
// These are conservative reservation ceilings, not provider price estimates. The Harness reserves
// the declared upper bound before a paid call begins; unused reservation is intentionally not
// released within the run, so retries cannot silently exceed the run budget.

export type DeepInfraSpendClass = 'builder' | 'university_practice' | 'university_assessment' | 'mass_evaluation_judge'

const DEFAULTS: Readonly<Record<DeepInfraSpendClass, Readonly<{ callUsd:number; runUsd:number }>>> = Object.freeze({
  // Production 2026-09-24 Builder fallback calls were roughly $0.02-$0.03. Reserve materially more
  // per call but allow only a small number of paid fallback rounds before the Harness stops.
  builder: Object.freeze({ callUsd: 0.08, runUsd: 0.24 }),
  // Economy deliberate-practice calls were orders of magnitude cheaper. Keep a generous ceiling
  // without permitting a training loop to become an unbounded managed-provider spender.
  university_practice: Object.freeze({ callUsd: 0.005, runUsd: 0.01 }),
  // Independent exams/capstones can use larger prompts/outputs than practice. One bounded paid call
  // is allowed by default; operators may lower the ceiling through environment configuration.
  university_assessment: Object.freeze({ callUsd: 0.10, runUsd: 0.10 }),
  // Exact-artifact mass evaluation makes four strict-JSON judge calls per run, one per suite.
  // Reserve $0.05 per call; the run ceiling covers all four without weakening the evaluator.
  mass_evaluation_judge: Object.freeze({ callUsd: 0.05, runUsd: 0.20 }),
})

const ENV: Readonly<Record<DeepInfraSpendClass, Readonly<{ call:string; run:string }>>> = Object.freeze({
  builder: Object.freeze({
    call: 'DEEPINFRA_BUILDER_MAX_CALL_USD',
    run: 'DEEPINFRA_BUILDER_MAX_JOB_USD',
  }),
  university_practice: Object.freeze({
    call: 'DEEPINFRA_UNIVERSITY_PRACTICE_MAX_CALL_USD',
    run: 'DEEPINFRA_UNIVERSITY_PRACTICE_MAX_RUN_USD',
  }),
  university_assessment: Object.freeze({
    call: 'DEEPINFRA_UNIVERSITY_ASSESSMENT_MAX_CALL_USD',
    run: 'DEEPINFRA_UNIVERSITY_ASSESSMENT_MAX_RUN_USD',
  }),
  mass_evaluation_judge: Object.freeze({
    call: 'DEEPINFRA_MASS_EVALUATION_JUDGE_MAX_CALL_USD',
    run: 'DEEPINFRA_MASS_EVALUATION_JUDGE_MAX_RUN_USD',
  }),
})

function configuredUsd(name:string,fallback:number):number {
  const raw=String(process.env[name]??'').trim()
  if(!raw)return fallback
  const value=Number(raw)
  if(!Number.isFinite(value)||value<=0||value>100)throw new Error(`deepinfra_spend_ceiling_invalid:${name}`)
  return Number(value.toFixed(6))
}

export function deepInfraMaxCallUsd(kind:DeepInfraSpendClass):number {
  return configuredUsd(ENV[kind].call,DEFAULTS[kind].callUsd)
}

export function deepInfraMaxRunUsd(kind:DeepInfraSpendClass):number {
  const call=deepInfraMaxCallUsd(kind)
  const run=configuredUsd(ENV[kind].run,DEFAULTS[kind].runUsd)
  if(run+Number.EPSILON<call)throw new Error(`deepinfra_run_ceiling_below_call_ceiling:${ENV[kind].run}`)
  return run
}


// Exact-artifact mass evaluation runs under one Harness maxCostUsd. Keep that total ceiling honest:
// signed RunPod wake authority plus the bounded DeepInfra judge reservation. The DeepInfra ledger consumes
// only its per-call reservations, while the signed evaluation claim independently constrains RunPod wake.
export function massEvaluationHarnessMaxCostUsd(maxEstimatedRuntimeWakeCostUsd:number,judgeCalls:number):number {
  const wake=Number(maxEstimatedRuntimeWakeCostUsd)
  const calls=Number(judgeCalls)
  if(!Number.isFinite(wake)||wake<0)throw new Error('mass_evaluation_wake_cost_invalid')
  if(!Number.isInteger(calls)||calls<1)throw new Error('mass_evaluation_judge_calls_invalid')
  const judgeRun=deepInfraMaxRunUsd('mass_evaluation_judge')
  if(judgeRun+Number.EPSILON<deepInfraMaxCallUsd('mass_evaluation_judge')*calls){
    throw new Error('deepinfra_run_ceiling_below_judge_calls:DEEPINFRA_MASS_EVALUATION_JUDGE_MAX_RUN_USD')
  }
  return Number((wake+judgeRun).toFixed(6))
}
