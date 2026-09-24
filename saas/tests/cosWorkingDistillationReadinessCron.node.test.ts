import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

function source(path:string){return readFileSync(new URL('../'+path,import.meta.url),'utf8')}

test('Working COS readiness cron is secret-gated, scheduled, and non-spending',()=>{
  const route=source('app/api/cron/cos-working-distillation-readiness/route.ts')
  const dispatch=source('lib/ai/cos/cosWorkingDistillationDispatch.ts')
  const config=JSON.parse(source('vercel.json'))

  assert.match(route,/CRON_SECRET/)
  assert.match(route,/ensureWorkingCosCandidateReadiness/)
  assert.doesNotMatch(route,/dispatchWorkingCosDatasetPreparation/)
  assert.doesNotMatch(route,/dispatchWorkingCosTraining/)
  assert.deepEqual(
    config.crons.find((item:{path:string})=>item.path==='/api/cron/cos-working-distillation-readiness'),
    {path:'/api/cron/cos-working-distillation-readiness',schedule:'46 * * * *'},
  )

  assert.match(dispatch,/semantics: 'non_spending_working_cos_candidate_readiness_registration'/)
  assert.match(dispatch,/automaticTrainingAuthorized: false/)
  assert.match(dispatch,/automaticActivationAuthorized: false/)
  assert.match(dispatch,/productionTrafficAuthorized: false/)
  assert.match(dispatch,/universityGraduationClaimed: false/)
  assert.match(dispatch,/nextGate: 'explicit_owner_confirmed_dataset_preparation'/)
})

test('readiness registration re-proves exact runtime and materializes the balanced bundle',()=>{
  const dispatch=source('lib/ai/cos/cosWorkingDistillationDispatch.ts')
  assert.match(dispatch,/ensureCurrentCandidate\(input\)/)
  assert.match(dispatch,/queryWorkingCosRuntimeIdentity/)
  assert.match(dispatch,/workingCosRuntimeBindingFromEnv/)
  assert.match(dispatch,/selectWorkingCosBalancedBundleFromVault/)
  assert.match(dispatch,/registerWorkingCosDistillationCandidate/)
  assert.match(dispatch,/readWorkingCosDatasetMaterialization/)
})

test('Production Vercel gate is not left on a diagnostic-only slice',()=>{
  const gate=source('scripts/vercel-cos-gates.mjs')
  assert.doesNotMatch(gate,/Diagnostic-only single-test gate/)
  assert.doesNotMatch(gate,/Never merge\./)
  for(const file of [
    'builderRepositoryRepairProofController.node.test.ts',
    'cosFreshnessPolicy.node.test.ts',
    'cosTravelPlanningFreshness.node.test.ts',
    'cosPragmaticIntentCore.node.test.ts',
  ]) assert.match(gate,new RegExp(file.replaceAll('.','\\.')))
})
