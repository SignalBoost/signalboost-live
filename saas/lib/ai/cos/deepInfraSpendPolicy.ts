// saas/lib/ai/cos/deepInfraSpendPolicy.ts
//
// Host-owned spend ceilings for paid DeepInfra fallback/training/assessment calls.
// These are conservative reservation ceilings, not provider price estimates. The Harness reserves
// the declared upper bound before a paid call begins; unused reservation is intentionally not
// released within the run, so retries cannot silently exceed the run budget.

export type DeepInfraSpendClass = 'builder' | 'university_practice' | 'university_assessment'

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
