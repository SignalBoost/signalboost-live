import assert from 'node:assert/strict'
import test from 'node:test'
import {
  BUILDER_RESIDENCY_CASES,
  builderResidencyCaseByVariantHash,
  createBuilderResidencyHarnessExecutor,
  runBuilderResidencyCase,
  type BuilderResidencyEvidenceStore,
  type BuilderResidencyExactArtifactExecutor,
  type HarnessAuthorityEnvelope,
  type HarnessEvidenceSink,
  type HarnessRunResult,
} from '../platform-harness/index.ts'

const hash=(char:string)=>char.repeat(64)

const authority:HarnessAuthorityEnvelope={
  manifestRef:'referee://residency/test',
  verified:true,
  verifiedBy:'referee',
  environments:['sandbox'],
  capabilities:BUILDER_RESIDENCY_CASES.length?[
    {id:'mcp.github-mcp.contents.read',environments:['sandbox'],mutating:false,risk:'read'},
    {id:'mcp.github-mcp.code.search',environments:['sandbox'],mutating:false,risk:'read'},
    {id:'mcp.github-mcp.commits.list',environments:['sandbox'],mutating:false,risk:'read'},
    {id:'mcp.github-mcp.commit.read',environments:['sandbox'],mutating:false,risk:'read'},
    {id:'mcp.github-mcp.branches.list',environments:['sandbox'],mutating:false,risk:'read'},
    {id:'mcp.github-mcp.pull_request.read',environments:['sandbox'],mutating:false,risk:'read'},
    {id:'mcp.github-mcp.branch.create',environments:['sandbox'],mutating:true,risk:'write'},
    {id:'mcp.github-mcp.contents.write',environments:['sandbox'],mutating:true,risk:'write'},
    {id:'mcp.github-mcp.pull_request.create',environments:['sandbox'],mutating:true,risk:'write'},
    {id:'mcp.vercel-mcp.project.read',environments:['sandbox'],mutating:false,risk:'read'},
    {id:'mcp.vercel-mcp.deployments.list',environments:['sandbox'],mutating:false,risk:'read'},
    {id:'mcp.vercel-mcp.deployment.read',environments:['sandbox'],mutating:false,risk:'read'},
    {id:'mcp.vercel-mcp.deployment_build_logs.read',environments:['sandbox'],mutating:false,risk:'read'},
    {id:'mcp.vercel-mcp.runtime_logs.read',environments:['sandbox'],mutating:false,risk:'read'},
    {id:'mcp.supabase-mcp.tables.list',environments:['sandbox'],mutating:false,risk:'read'},
    {id:'mcp.supabase-mcp.logs.query',environments:['sandbox'],mutating:false,risk:'read'},
    {id:'mcp.supabase-mcp.advisors.read',environments:['sandbox'],mutating:false,risk:'read'},
    {id:'browser.playwright-mcp.snapshot',environments:['sandbox'],mutating:false,risk:'read'},
    {id:'browser.playwright-mcp.screenshot',environments:['sandbox'],mutating:false,risk:'read'},
    {id:'browser.playwright-mcp.console',environments:['sandbox'],mutating:false,risk:'read'},
    {id:'browser.playwright-mcp.network.list',environments:['sandbox'],mutating:false,risk:'read'},
    {id:'browser.chrome-devtools-mcp.snapshot',environments:['sandbox'],mutating:false,risk:'read'},
    {id:'browser.chrome-devtools-mcp.screenshot',environments:['sandbox'],mutating:false,risk:'read'},
    {id:'browser.chrome-devtools-mcp.console.list',environments:['sandbox'],mutating:false,risk:'read'},
    {id:'browser.chrome-devtools-mcp.network.list',environments:['sandbox'],mutating:false,risk:'read'},
    {id:'browser.chrome-devtools-mcp.lighthouse',environments:['sandbox'],mutating:false,risk:'read'},
  ]:[],
  limits:{maxToolCalls:120,deadlineMs:20*60_000,maxConcurrency:1},
}

function memoryStore(){
  const started:any[]=[]
  const finished:any[]=[]
  const competency:any[]=[]
  const harness:any[]=[]
  const store:BuilderResidencyEvidenceStore={
    async startCase(input){started.push(input);return {caseRunId:'case-run-1'}},
    async finishCase(input){finished.push(input)},
    async recordCompetency(input){competency.push(input)},
  }
  const harnessEvidenceSink:HarnessEvidenceSink={
    async append(record){harness.push(record)},
  }
  return {store,harnessEvidenceSink,started,finished,competency,harness}
}

function result(runId:string,status:HarnessRunResult['outcome']['status']):HarnessRunResult{
  return {
    runId,
    profile:'residency',
    trajectory:[{
      runId,
      sequence:1,
      at:'2026-09-22T23:15:00Z',
      kind:'verification',
      summary:'observable practical verification',
      evidenceRefs:['evidence://practice'],
    }],
    outcome:{
      status,
      verifierRef:'verifier://practice',
      ...(status==='success'?{}:{failureCode:'wrong_diagnosis'}),
    },
    authorityExpanded:false,
    productionMutationObserved:false,
  }
}

const base={
  residencyId:'residency-1',
  candidateId:'mass:test:0123456789abcdef',
  subjectId:'computer_science_coding',
  tenantId:'tenant-1',
  portableId:'builder',
  agentId:'builder-resident-1',
  artifactId:'artifact-1',
  artifactHash:hash('a'),
  artifactRevision:'rev-1',
  sandboxEnvironmentId:'residency-sandbox-1',
  authority,
}

test('Builder Residency catalog contains only practice cases with stable distinct variant hashes',()=>{
  assert.ok(BUILDER_RESIDENCY_CASES.length>=3)
  assert.equal(new Set(BUILDER_RESIDENCY_CASES.map(item=>item.variantHash)).size,BUILDER_RESIDENCY_CASES.length)
  for(const item of BUILDER_RESIDENCY_CASES){
    assert.match(item.variantHash,/^[a-f0-9]{64}$/)
    assert.equal(builderResidencyCaseByVariantHash(item.variantHash)?.variantId,item.variantId)
    assert.ok(item.provingCommand.length>0)
  }
})

test('successful exact-artifact practice persists pass evidence and never grants promotion',async()=>{
  const mem=memoryStore()
  let calls=0
  const executor:BuilderResidencyExactArtifactExecutor={
    async run(input){
      calls+=1
      assert.equal(input.request.identity.artifact?.artifactHash,hash('a'))
      assert.equal(input.request.profile,'residency')
      assert.equal(input.request.environment.class,'sandbox')
      return result(input.request.runId,'success')
    },
  }

  const out=await runBuilderResidencyCase({
    ...base,
    practiceCase:BUILDER_RESIDENCY_CASES[0],
    executor,
    harnessEvidenceSink:mem.harnessEvidenceSink,
    store:mem.store,
    now:()=>new Date('2026-09-22T23:15:00Z'),
  })

  assert.equal(calls,1)
  assert.equal(out.ok,true)
  if(!out.ok)return
  assert.equal(out.outcome,'pass')
  assert.equal(out.route,'competency_evidence')
  assert.equal(mem.started.length,1)
  assert.equal(mem.harness.length,1)
  assert.equal(mem.harness[0].runId,out.runId)
  assert.equal(JSON.stringify(mem.harness[0]).includes('Inspect total.js'),false)
  assert.equal(mem.competency.length,1)
  assert.equal(mem.competency[0].outcome,'pass')
  assert.equal(mem.finished[0].status,'passed')
})

test('independently attributed competency failure persists remediation evidence',async()=>{
  const mem=memoryStore()
  const executor:BuilderResidencyExactArtifactExecutor={
    async run(input){return result(input.request.runId,'agent_failure')},
  }

  const out=await runBuilderResidencyCase({
    ...base,
    practiceCase:BUILDER_RESIDENCY_CASES[1],
    executor,
    harnessEvidenceSink:mem.harnessEvidenceSink,
    store:mem.store,
    now:()=>new Date('2026-09-22T23:16:00Z'),
  })

  assert.equal(out.ok,true)
  if(!out.ok)return
  assert.equal(out.outcome,'fail')
  assert.equal(out.route,'remediation')
  assert.equal(out.competencyState,'remediation_required')
  assert.equal(mem.competency[0].outcome,'fail')
  assert.equal(mem.finished[0].status,'failed')
})

test('infrastructure and authority outcomes are rejected as competency evidence',async()=>{
  for(const status of ['infrastructure_failure','authority_halt'] as const){
    const mem=memoryStore()
    const executor:BuilderResidencyExactArtifactExecutor={
      async run(input){return result(input.request.runId,status)},
    }
    const out=await runBuilderResidencyCase({
      ...base,
      practiceCase:BUILDER_RESIDENCY_CASES[2],
      executor,
      harnessEvidenceSink:mem.harnessEvidenceSink,
    store:mem.store,
    })
    assert.equal(out.ok,false)
    assert.equal(mem.competency.length,0)
    assert.equal(mem.finished[0].status,'rejected')
  }
})

test('manifest fails closed before durable case start when authority is incomplete',async()=>{
  const mem=memoryStore()
  const executor:BuilderResidencyExactArtifactExecutor={
    async run(){throw new Error('must_not_run')},
  }
  const out=await runBuilderResidencyCase({
    ...base,
    authority:{...authority,capabilities:[]},
    practiceCase:BUILDER_RESIDENCY_CASES[0],
    executor,
    harnessEvidenceSink:mem.harnessEvidenceSink,
    store:mem.store,
  })
  assert.equal(out.ok,false)
  assert.equal(out.reason,'residency_manifest_rejected')
  assert.equal(mem.started.length,0)
})


test('shared Harness evidence must persist before University competency evidence',async()=>{
  const mem=memoryStore()
  const failingSink:HarnessEvidenceSink={
    async append(){throw new Error('ledger_down')},
  }
  const executor:BuilderResidencyExactArtifactExecutor={
    async run(input){return result(input.request.runId,'success')},
  }
  const out=await runBuilderResidencyCase({
    ...base,
    practiceCase:BUILDER_RESIDENCY_CASES[0],
    executor,
    harnessEvidenceSink:failingSink,
    store:mem.store,
  })
  assert.equal(out.ok,false)
  assert.equal(out.reason,'residency_harness_completion_failed')
  assert.equal(mem.competency.length,0)
  assert.equal(mem.finished[0].status,'rejected')
})


test('Builder Residency live executor uses shared Harness and preserves exact artifact binding',async()=>{
  let workerCalls=0
  const live=createBuilderResidencyHarnessExecutor({
    capabilities:{async resolve(manifest){return{satisfied:true,missing:[],resolved:Object.fromEntries(manifest.capabilities.map(item=>[item.id,{id:item.id}]))} as any}},
    executor:{async execute(_manifest,action){return{actionId:action.actionId,capabilityId:action.capabilityId,status:'executed'} as any}},
    worker:{async run(context){workerCalls+=1;assert.equal(context.manifest.identity.artifact?.artifactHash,hash('a'));context.observe({summary:'exact artifact observed',evidenceRefs:['evidence://exact-artifact']})}},
    verifier:{async verify(input){assert.equal(input.manifest.identity.artifact?.artifactHash,hash('a'));return{verified:true,verifierRef:'verifier://residency-live',evidenceRefs:['evidence://exact-artifact']}}},
  })
  const request=(await import('../platform-harness/adapters/builder.ts')).createBuilderResidencyHarnessRequest({...base,runId:'live-residency-1',objective:'practice',sandboxEnvironmentId:base.sandboxEnvironmentId})
  const out=await live.run({request,authority,practiceCase:BUILDER_RESIDENCY_CASES[0]})
  assert.equal(workerCalls,1)
  assert.equal(out.outcome.status,'success')
  assert.equal(out.authorityExpanded,false)
  assert.equal(out.productionMutationObserved,false)
})
