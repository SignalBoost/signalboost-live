// saas/tests/itmountsLabUniversityExecution.node.test.ts
import assert from 'node:assert/strict'
import test from 'node:test'
import { bindLabExperimentToUniversityRun, type LabExecutionDb, type VerifiedLabAuthority } from '../lib/ai/cos/itmountsLabUniversityExecution.ts'

const ORG='11111111-1111-4111-8111-111111111111'
const EXP='22222222-2222-4222-8222-222222222222'
const RUN='33333333-3333-4333-8333-333333333333'
const HARNESS='44444444-4444-4444-8444-444444444444'

function authority(overrides: Partial<VerifiedLabAuthority> = {}): VerifiedLabAuthority {
  return { verifiedByHarness:true, organizationId:ORG, harnessRunId:HARNESS,
    capability:'university.distillation.execute', authorityExpanded:false, ...overrides }
}
function db(overrides: Partial<LabExecutionDb> = {}) {
  const bindings:any[]=[]
  const value: LabExecutionDb = {
    async readExperiment({organizationId,experimentId}) {
      return organizationId===ORG && experimentId===EXP
        ? { id:EXP, organizationId:ORG, privacyTier:'PRIVATE', budgetMicrocredits:1000 } : null
    },
    async readUniversityRun(runId) { return runId===RUN ? { id:RUN, authorityExpanded:false } : null },
    async bindUniversityRun(input) { bindings.push(input) },
    ...overrides,
  }
  return { value, bindings }
}

test('binds verified tenant experiment to the existing University run and carries privacy', async () => {
  const store=db()
  const result=await bindLabExperimentToUniversityRun({authority:authority(),experimentId:EXP,runId:RUN,db:store.value})
  assert.equal(result.factory,'existing_cos_university')
  assert.equal(result.privacyTier,'PRIVATE')
  assert.equal(result.authorityExpanded,false)
  assert.equal(store.bindings.length,1)
  assert.equal(store.bindings[0].organizationId,ORG)
  assert.equal(store.bindings[0].harnessRunId,HARNESS)
})

test('fails closed on cross-tenant experiment', async () => {
  const store=db()
  await assert.rejects(
    bindLabExperimentToUniversityRun({authority:authority({organizationId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'}),experimentId:EXP,runId:RUN,db:store.value}),
    /lab_execution_experiment_tenant_mismatch/
  )
  assert.equal(store.bindings.length,0)
})

test('fails closed when Harness authority is expanded or wrong capability', async () => {
  const store=db()
  await assert.rejects(
    bindLabExperimentToUniversityRun({authority:{...authority(),authorityExpanded:true} as any,experimentId:EXP,runId:RUN,db:store.value}),
    /lab_execution_harness_authority_denied/
  )
  await assert.rejects(
    bindLabExperimentToUniversityRun({authority:{...authority(),capability:'other'} as any,experimentId:EXP,runId:RUN,db:store.value}),
    /lab_execution_harness_authority_denied/
  )
  assert.equal(store.bindings.length,0)
})

test('fails closed on University authority expansion and invalid experiment budget', async () => {
  const expanded=db({async readUniversityRun(){return {id:RUN,authorityExpanded:true}}})
  await assert.rejects(bindLabExperimentToUniversityRun({authority:authority(),experimentId:EXP,runId:RUN,db:expanded.value}),/lab_execution_authority_expansion_denied/)

  const badBudget=db({async readExperiment(){return {id:EXP,organizationId:ORG,privacyTier:'PRIVATE',budgetMicrocredits:-1}}})
  await assert.rejects(bindLabExperimentToUniversityRun({authority:authority(),experimentId:EXP,runId:RUN,db:badBudget.value}),/lab_execution_budget_invalid/)
})
