import assert from 'node:assert/strict'
import test from 'node:test'
import {
  BUILDER_RESIDENCY_CASES,
  BUILDER_RESIDENCY_MODEL_ROUND_TIMEOUT_MS,
  BUILDER_RESIDENCY_NATIVE_CAPABILITIES,
  BUILDER_RESIDENCY_PROVIDER_TIMEOUT_MS,
  createBuilderResidencyHarnessRequest,
  createBuilderResidencyNativeAuthority,
  createLiveBuilderResidencyExecutor,
  type BuilderResidencyModelPort,
} from '../platform-harness/index.ts'
import type {
  BuilderFile,
  BuilderRunResult,
  BuilderRunnerPort,
} from '../lib/builder/contracts.ts'

const H='a'.repeat(64)
const R='b'.repeat(64)

class FixtureRunner implements BuilderRunnerPort{
  calls=0
  async run(input:{
    workspaceId:string
    command:string
    files:readonly BuilderFile[]
  }):Promise<BuilderRunResult>{
    this.calls+=1
    const total=input.files.find(file=>file.path==='total.js')?.content??''
    const fixed=total.includes('index < values.length')
    return {
      exitCode:fixed?0:1,
      stdout:fixed?'ok\n':'',
      stderr:fixed?'':'NaN',
      timedOut:false,
      executedCommand:input.command,
    }
  }
}

function scriptedModelPort():BuilderResidencyModelPort{
  const replies=[
    '{"type":"tool","toolId":"run","input":{"command":"node total.js"}}',
    '{"type":"tool","toolId":"edit_file","input":{"path":"total.js","search":"index <= values.length","replace":"index < values.length"}}',
    '{"type":"tool","toolId":"run","input":{"command":"node total.js"}}',
    '{"type":"answer","answer":"Repaired loop boundary and reran the same command."}',
  ]
  return Object.freeze({
    async complete(input){
      assert.equal(input.identity.candidateId,'candidate-1')
      assert.equal(input.identity.artifactHash,H)
      assert.equal(input.identity.revisionKey,R)
      return Object.freeze({
        text:replies.shift()??'{"type":"answer","answer":"done"}',
        endpointId:'ep_123',
        modelId:`itmounts-mass-distilled-${H.slice(0,12)}-runtime1`,
        exactArtifact:true as const,
      })
    },
  })
}


test('live Residency keeps nested exact-model timeouts ordered inside the Harness deadline',()=>{
  assert.equal(BUILDER_RESIDENCY_MODEL_ROUND_TIMEOUT_MS,90_000)
  assert.equal(BUILDER_RESIDENCY_PROVIDER_TIMEOUT_MS,110_000)
  assert.ok(BUILDER_RESIDENCY_PROVIDER_TIMEOUT_MS>BUILDER_RESIDENCY_MODEL_ROUND_TIMEOUT_MS)
  assert.ok(BUILDER_RESIDENCY_PROVIDER_TIMEOUT_MS<240_000)
})

test('live Residency routes model-controlled edits and commands through Governed Socket',async()=>{
  const practiceCase=BUILDER_RESIDENCY_CASES.find(
    item=>item.competencyId==='root_cause_diagnosis',
  )
  assert.ok(practiceCase)

  const request=createBuilderResidencyHarnessRequest({
    runId:'residency-live-test-1',
    objective:practiceCase.objective,
    tenantId:'itmounts-university',
    portableId:'builder-residency',
    agentId:'builder-resident',
    artifactId:'artifact-1',
    artifactHash:H,
    artifactRevision:R,
    sandboxEnvironmentId:'builder-residency-sandbox-v1',
    requestedCapabilities:BUILDER_RESIDENCY_NATIVE_CAPABILITIES,
    limits:{
      deadlineMs:180_000,
      maxToolCalls:60,
      maxConcurrency:1,
    },
  })
  const runner=new FixtureRunner()
  const executor=createLiveBuilderResidencyExecutor({
    db:{} as any,
    sandboxRunner:runner,
    modelPortFactory:scriptedModelPort,
  })

  const result=await executor.run({
    request,
    authority:createBuilderResidencyNativeAuthority(),
    practiceCase,
    candidateId:'candidate-1',
  })

  assert.equal(result.outcome.status,'success')
  assert.equal(result.authorityExpanded,false)
  assert.equal(result.productionMutationObserved,false)

  const calls=result.trajectory.filter(event=>event.kind==='tool_call')
  assert.ok(calls.length>=3)
  assert.ok(calls.some(event=>
    String(event.data?.capabilityId)===
      'native.builder-residency.file.edit',
  ))
  assert.ok(calls.some(event=>
    String(event.data?.capabilityId)===
      'native.builder-residency.command.run',
  ))
  assert.ok(result.trajectory.some(event=>event.kind==='verification'))
  // baseline + repaired command + independent verifier
  assert.ok(runner.calls>=3)
})


test('live Residency serializes batched seed-file reads inside maxConcurrency one',async()=>{
  const practiceCase=BUILDER_RESIDENCY_CASES.find(
    item=>item.competencyId==='test_and_regression_construction',
  )
  assert.ok(practiceCase)
  assert.ok(practiceCase.seedFiles.length>1)

  const request=createBuilderResidencyHarnessRequest({
    runId:'residency-live-test-multi-file',
    objective:practiceCase.objective,
    tenantId:'itmounts-university',
    portableId:'builder-residency',
    agentId:'builder-resident',
    artifactId:'artifact-1',
    artifactHash:H,
    artifactRevision:R,
    sandboxEnvironmentId:'builder-residency-sandbox-v1',
    requestedCapabilities:BUILDER_RESIDENCY_NATIVE_CAPABILITIES,
    limits:{deadlineMs:180_000,maxToolCalls:60,maxConcurrency:1},
  })
  const replies=[
    '{"type":"tool","toolId":"edit_file","input":{"path":"slug.js","search":"return value.toLowerCase().replace(\\' \\', \\'-\\')","replace":"return value.toLowerCase().replace(/[^a-z0-9]+/g, \\'-\\').replace(/^-|-$/g, \\'\\')"}}',
    '{"type":"tool","toolId":"run","input":{"command":"node slug.test.js"}}',
    '{"type":"answer","answer":"Repaired normalization and verified the regression."}',
  ]
  const modelPort:BuilderResidencyModelPort={
    async complete(){
      return Object.freeze({
        text:replies.shift()??'{"type":"answer","answer":"done"}',
        endpointId:'ep_multi',
        modelId:'itmounts-mass-distilled-multi',
        exactArtifact:true as const,
      })
    },
  }
  const runner:BuilderRunnerPort={
    async run(input){
      const source=input.files.find(file=>file.path==='slug.js')?.content??''
      const fixed=source.includes("replace(/[^a-z0-9]+/g, '-')")
      return {
        exitCode:fixed?0:1,
        stdout:fixed?'ok\n':'',
        stderr:fixed?'':'not fixed',
        timedOut:false,
        executedCommand:input.command,
      }
    },
  }
  const executor=createLiveBuilderResidencyExecutor({
    db:{} as any,
    sandboxRunner:runner,
    modelPortFactory:()=>modelPort,
  })
  const result=await executor.run({
    request,
    authority:createBuilderResidencyNativeAuthority(),
    practiceCase,
    candidateId:'candidate-multi',
  })

  assert.notEqual(result.outcome.failureCode,'harness_concurrency_limit_exceeded')
  assert.equal(result.outcome.status,'success')
})

test('live Residency native authority is sandbox-only and non-consequential',()=>{
  const authority=createBuilderResidencyNativeAuthority()
  assert.deepEqual(authority.environments,['sandbox'])
  assert.equal(
    authority.capabilities.some(item=>item.risk==='consequential'),
    false,
  )
  assert.equal(
    authority.capabilities.some(item=>
      /merge|deploy|migration|sql/i.test(item.id),
    ),
    false,
  )
  assert.deepEqual(
    authority.capabilities.map(item=>item.id),
    [...BUILDER_RESIDENCY_NATIVE_CAPABILITIES],
  )
})

test('live Residency fails closed when exact artifact revision is absent',async()=>{
  const practiceCase=BUILDER_RESIDENCY_CASES[0]
  const request=createBuilderResidencyHarnessRequest({
    runId:'residency-live-test-missing-revision',
    objective:practiceCase.objective,
    tenantId:'itmounts-university',
    portableId:'builder-residency',
    agentId:'builder-resident',
    artifactId:'artifact-1',
    artifactHash:H,
    sandboxEnvironmentId:'builder-residency-sandbox-v1',
    requestedCapabilities:BUILDER_RESIDENCY_NATIVE_CAPABILITIES,
  })
  const executor=createLiveBuilderResidencyExecutor({
    db:{} as any,
    sandboxRunner:new FixtureRunner(),
    modelPortFactory:scriptedModelPort,
  })
  await assert.rejects(
    ()=>executor.run({
      request,
      authority:createBuilderResidencyNativeAuthority(),
      practiceCase,
      candidateId:'candidate-1',
    }),
    /residency_exact_artifact_identity_missing/,
  )
})


test('live Residency classifies exact-artifact prewarm failure as infrastructure without grading the resident',async()=>{
  const practiceCase=BUILDER_RESIDENCY_CASES[0]
  const request=createBuilderResidencyHarnessRequest({
    runId:'residency-live-test-prewarm-failure',
    objective:practiceCase.objective,
    tenantId:'itmounts-university',
    portableId:'builder-residency',
    agentId:'builder-resident',
    artifactId:'artifact-1',
    artifactHash:H,
    artifactRevision:R,
    sandboxEnvironmentId:'builder-residency-sandbox-v1',
    requestedCapabilities:BUILDER_RESIDENCY_NATIVE_CAPABILITIES,
  })
  let completeCalls=0
  const modelPort:BuilderResidencyModelPort={
    async prepare(){throw new Error('residency_exact_artifact_runtime_not_ready')},
    async complete(){
      completeCalls+=1
      throw new Error('must_not_generate_when_prewarm_failed')
    },
  }
  const executor=createLiveBuilderResidencyExecutor({
    db:{} as any,
    sandboxRunner:new FixtureRunner(),
    modelPortFactory:()=>modelPort,
  })
  const result=await executor.run({
    request,
    authority:createBuilderResidencyNativeAuthority(),
    practiceCase,
    candidateId:'candidate-1',
  })
  assert.equal(result.outcome.status,'infrastructure_failure')
  assert.equal(result.outcome.failureCode,'residency_exact_artifact_runtime_not_ready')
  assert.equal(completeCalls,0)
  assert.equal(result.authorityExpanded,false)
  assert.equal(result.productionMutationObserved,false)
})
