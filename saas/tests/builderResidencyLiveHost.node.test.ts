import assert from 'node:assert/strict'
import test from 'node:test'
import {
  BUILDER_RESIDENCY_CASES,
  BUILDER_RESIDENCY_NATIVE_CAPABILITIES,
  createBuilderResidencyHarnessRequest,
  createBuilderResidencyNativeAuthority,
  createExactArtifactResidencyBuilderAi,
  createLiveBuilderResidencyExecutor,
  resolveBuilderResidencyServingIdentity,
} from '../platform-harness/index.ts'
import type {
  BuilderAiPort,
  BuilderFile,
  BuilderRunResult,
  BuilderRunnerPort,
} from '../lib/builder/contracts.ts'

const H='a'.repeat(64)

function serving(){
  return {
    candidateId:'candidate-1',
    artifactHash:H,
    endpointId:'abc123',
    modelId:`itmounts-mass-distilled-${H.slice(0,12)}-runtime`,
    baseUrl:'https://abc123.api.runpod.ai/v1',
    evidenceObservedAt:'2026-09-22T20:00:00Z',
  }
}

test('exact-artifact Builder AI disables configured-model fallback',async()=>{
  let seen:any=null
  const ai=createExactArtifactResidencyBuilderAi({
    identity:serving(),
    apiKey:'test-key',
    callModel:async(args,config)=>{
      seen={args,config}
      return '{"type":"answer","answer":"ok"}'
    },
  })
  const out=await ai.generate({systemPrompt:'system',prompt:'work',maxTokens:400})
  assert.match(String(out),/"type":"answer"/)
  assert.equal(seen.args.allowConfiguredFallback,false)
  assert.equal(seen.args.disableThinking,true)
  assert.equal(seen.args.jsonObject,true)
  assert.equal(seen.config.baseUrl,'https://abc123.api.runpod.ai/v1')
  assert.equal(seen.config.model,serving().modelId)
})

test('serving identity requires exact host-controller canary evidence',async()=>{
  const rows=[{
    verifier:'host_controller',
    evidence:{
      claim:'local_distilled_runtime_canary_passed',
      exactArtifact:true,
      candidateId:'candidate-1',
      artifactHash:H,
      endpointId:'abc123',
      model:serving().modelId,
    },
    observed_at:'2026-09-22T20:00:00Z',
  }]
  const db:any={
    from(table:string){
      assert.equal(table,'cos_university_learning_assurance_events')
      return{
        select(){return this},
        eq(){return this},
        contains(){return this},
        order(){return this},
        async limit(){return{data:rows,error:null}},
      }
    },
  }
  const identity=await resolveBuilderResidencyServingIdentity({
    db,
    candidateId:'candidate-1',
    artifactHash:H,
  })
  assert.equal(identity.endpointId,'abc123')
  assert.equal(identity.modelId,serving().modelId)

  rows[0].evidence.exactArtifact=false
  await assert.rejects(
    ()=>resolveBuilderResidencyServingIdentity({db,candidateId:'candidate-1',artifactHash:H}),
    /residency_runtime_exact_serving_identity_missing/,
  )
})

class FixtureRunner implements BuilderRunnerPort{
  calls=0
  async run(input:{workspaceId:string;command:string;files:readonly BuilderFile[]}):Promise<BuilderRunResult>{
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

function scriptedAi():BuilderAiPort{
  const replies=[
    '{"type":"tool","toolId":"run","input":{"command":"node total.js"}}',
    '{"type":"tool","toolId":"edit_file","input":{"path":"total.js","search":"index <= values.length","replace":"index < values.length"}}',
    '{"type":"tool","toolId":"run","input":{"command":"node total.js"}}',
    '{"type":"answer","answer":"Repaired loop boundary and reran the same command."}',
  ]
  return{
    async generate(){
      return replies.shift()??'{"type":"answer","answer":"done"}'
    },
  }
}

test('live Residency routes model-controlled file and run actions through Governed Socket',async()=>{
  const practiceCase=BUILDER_RESIDENCY_CASES.find(item=>item.competencyId==='root_cause_diagnosis')!
  assert.ok(practiceCase)
  const request=createBuilderResidencyHarnessRequest({
    runId:'residency-live-test-1',
    objective:practiceCase.objective,
    tenantId:'itmounts-university',
    portableId:'builder-residency',
    agentId:'builder-resident',
    artifactId:'artifact-1',
    artifactHash:H,
    sandboxEnvironmentId:'builder-residency-sandbox-v1',
    requestedCapabilities:BUILDER_RESIDENCY_NATIVE_CAPABILITIES,
    limits:{deadlineMs:180_000,maxToolCalls:60,maxConcurrency:1},
  })
  const runner=new FixtureRunner()
  const executor=createLiveBuilderResidencyExecutor({
    db:{} as any,
    sandboxRunner:runner,
    resolveServingIdentity:async()=>serving(),
    aiFactory:()=>scriptedAi(),
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
  assert.ok(calls.some(event=>String(event.data?.capabilityId)==='native.builder-residency.file.edit'))
  assert.ok(calls.some(event=>String(event.data?.capabilityId)==='native.builder-residency.command.run'))
  assert.ok(result.trajectory.some(event=>event.kind==='verification'))
  assert.ok(runner.calls>=3)
})

test('live Residency never requests Production or consequential capabilities',()=>{
  const authority=createBuilderResidencyNativeAuthority()
  assert.deepEqual(authority.environments,['sandbox'])
  assert.equal(authority.capabilities.some(item=>item.risk==='consequential'),false)
  assert.equal(authority.capabilities.some(item=>/merge|deploy|migration|sql/i.test(item.id)),false)
})
