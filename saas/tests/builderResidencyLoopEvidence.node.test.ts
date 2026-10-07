// saas/tests/builderResidencyLoopEvidence.node.test.ts
//
// Production 2026-10-05: every counted Builder Residency failure (128 of them) was `residency_proof_exit_1`. That label
// cannot tell a resident that made the wrong fix from one that ran out of time or rounds before editing anything,
// because the executor observed its own work loop (completed or not, why it stopped, steps) and then discarded it.
// The case run now keeps that observation, plus how many seed files changed, in its existing metadata column.
// Outcomes, attribution and competency evidence are unchanged.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  BUILDER_RESIDENCY_CASES,
  builderLoopMetadata,
  builderLoopShape,
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
  const finished:any[]=[]
  const competency:any[]=[]
  const store:BuilderResidencyEvidenceStore={
    async startCase(){return {caseRunId:'case-run-1'}},
    async finishCase(input){finished.push(input)},
    async recordCompetency(input){competency.push(input)},
  }
  const harnessEvidenceSink:HarnessEvidenceSink={async append(){}}
  return {store,harnessEvidenceSink,finished,competency}
}

const loopObservation=(data:Record<string,unknown>)=>({
  runId:'x',sequence:1,at:'2026-10-05T23:00:00Z',kind:'observation' as const,
  summary:'Resident Builder stopped before proving practical completion.',evidenceRefs:[],data,
})

function result(runId:string,status:HarnessRunResult['outcome']['status'],data?:Record<string,unknown>):HarnessRunResult{
  return {
    runId,
    profile:'residency',
    trajectory:[
      ...(data?[{...loopObservation(data),runId}]:[]),
      {runId,sequence:2,at:'2026-10-05T23:00:01Z',kind:'verification',summary:'observable practical verification',evidenceRefs:['evidence://practice']},
    ] as any,
    outcome:{status,verifierRef:'verifier://practice',...(status==='success'?{}:{failureCode:'residency_proof_exit_1'})},
    authorityExpanded:false,
    productionMutationObserved:false,
  }
}

const base={
  residencyId:'residency-1',candidateId:'mass:test:0123456789abcdef',subjectId:'computer_science_coding',
  tenantId:'tenant-1',portableId:'builder',agentId:'builder-resident-1',artifactId:'artifact-1',
  artifactHash:hash('a'),artifactRevision:'rev-1',sandboxEnvironmentId:'residency-sandbox-1',authority,
}

test('the last loop observation becomes the case metadata; anything else is ignored',()=>{
  assert.deepEqual(builderLoopMetadata([
    loopObservation({builderOutcome:'incomplete',traceSteps:3,filesChanged:0,failureCode:'builder_deadline_reached'}),
  ]),{builderLoop:{outcome:'incomplete',failureCode:'builder_deadline_reached',traceSteps:3,filesChanged:0,shape:null}})
  assert.deepEqual(builderLoopMetadata([loopObservation({builderOutcome:'completed',traceSteps:7,filesChanged:1})]),
    {builderLoop:{outcome:'completed',failureCode:null,traceSteps:7,filesChanged:1,shape:null}})
  // An infrastructure-only observation (no loop ran) and non-observations carry no loop record.
  assert.equal(builderLoopMetadata([loopObservation({failureCode:'residency_exact_artifact_runtime_not_ready'})]),undefined)
  assert.equal(builderLoopMetadata([{kind:'verification',data:{builderOutcome:'completed'}}]),undefined)
  assert.equal(builderLoopMetadata(null),undefined)
  // Unknown counts are null, never guessed.
  assert.deepEqual(builderLoopMetadata([loopObservation({builderOutcome:'incomplete',traceSteps:'x',filesChanged:null})]),
    {builderLoop:{outcome:'incomplete',failureCode:null,traceSteps:null,filesChanged:null,shape:null}})
})

test('the loop shape is content-free and run-length encoded, so a repeated identical call is visible',()=>{
  const trace=[
    {round:1,toolId:'read_file',input:{path:'secret/case.js'},ok:true,output:'source text'},
    {round:2,toolId:'run',input:{command:'node verify.js'},ok:false,error:'Error: expected 3 got 4 at verify.js:12'},
    {round:3,toolId:'read_file',input:{path:'verify.js'},ok:false,error:'builder_repeated_tool_call:read_file; choose a different next step'},
    {round:4,toolId:'read_file',input:{path:'verify.js'},ok:false,error:'builder_repeated_tool_call:read_file; choose a different next step'},
    {round:5,toolId:'read_file',input:{path:'verify.js'},ok:false,error:'builder_repeated_tool_call:read_file; choose a different next step'},
    {round:6,toolId:'model_control',input:{},ok:false,error:'builder_repair_progress_required'},
    {round:7,toolId:'edit_file',input:{path:'case.js'},ok:true},
  ]
  const shape=builderLoopShape(trace)
  assert.equal(shape,'read_file:ok > run:fail > read_file:builder_repeated_tool_call x3 > model_control:builder_repair_progress_required > edit_file:ok')
  // No paths, commands, output or error text reach the record.
  for(const leaked of ['secret','case.js','verify.js','node ','expected 3','source text']) assert.ok(!shape!.includes(leaked),leaked)
  assert.equal(builderLoopShape([]),null)
  assert.equal(builderLoopShape(null),null)
  assert.equal(builderLoopShape([{toolId:'Bad Tool!',ok:false,error:'Weird: thing'}]),'unknown:error')
  // Bounded.
  const long=Array.from({length:200},(_,i)=>({toolId:i%2?'read_file':'list_files',ok:true}))
  assert.ok(builderLoopShape(long)!.length<=400)
  // Carried through the case metadata.
  assert.deepEqual(builderLoopMetadata([loopObservation({builderOutcome:'incomplete',traceSteps:7,filesChanged:1,failureCode:'builder_stalled_repeated_inspection',loopShape:shape})]),
    {builderLoop:{outcome:'incomplete',failureCode:'builder_stalled_repeated_inspection',traceSteps:7,filesChanged:1,shape}})
  // The live executor records it on its observation.
  const executorSource=readFileSync(new URL('../platform-harness/residency/live-builder-executor.ts',import.meta.url),'utf8')
  assert.match(executorSource,/loopShape:builderLoopShape\(result\.trace\)/)
})

test('a counted failure keeps its outcome and now carries the loop record',async()=>{
  const mem=memoryStore()
  const executor:BuilderResidencyExactArtifactExecutor={
    async run(input){return result(input.request.runId,'agent_failure',{builderOutcome:'incomplete',traceSteps:4,filesChanged:0,failureCode:'builder_deadline_reached'})},
  }
  const out=await runBuilderResidencyCase({...base,practiceCase:BUILDER_RESIDENCY_CASES[0],executor,harnessEvidenceSink:mem.harnessEvidenceSink,store:mem.store})
  assert.equal(out.ok,true)
  if(!out.ok)return
  assert.equal(out.outcome,'fail')
  assert.equal(mem.competency[0].outcome,'fail')
  assert.equal(mem.finished[0].status,'failed')
  assert.equal(mem.finished[0].failureCode,'residency_proof_exit_1')
  assert.deepEqual(mem.finished[0].metadata,{builderLoop:{outcome:'incomplete',failureCode:'builder_deadline_reached',traceSteps:4,filesChanged:0,shape:null}})
})

test('a pass carries it too, and a run without a loop observation writes no metadata',async()=>{
  const mem=memoryStore()
  await runBuilderResidencyCase({...base,practiceCase:BUILDER_RESIDENCY_CASES[0],harnessEvidenceSink:mem.harnessEvidenceSink,store:mem.store,
    executor:{async run(input){return result(input.request.runId,'success',{builderOutcome:'completed',traceSteps:6,filesChanged:1})}}})
  assert.equal(mem.finished[0].status,'passed')
  assert.deepEqual(mem.finished[0].metadata,{builderLoop:{outcome:'completed',failureCode:null,traceSteps:6,filesChanged:1,shape:null}})

  const bare=memoryStore()
  await runBuilderResidencyCase({...base,practiceCase:BUILDER_RESIDENCY_CASES[0],harnessEvidenceSink:bare.harnessEvidenceSink,store:bare.store,
    executor:{async run(input){return result(input.request.runId,'success')}}})
  assert.equal(bare.finished[0].metadata,undefined)
})

test('the live executor observes files changed, and the store writes metadata only when given',()=>{
  const executor=readFileSync(new URL('../platform-harness/residency/live-builder-executor.ts',import.meta.url),'utf8')
  assert.match(executor,/filesChanged=\(await allFiles\(workspace,workspaceId\)\)\s*\.filter\(file=>seeds\.get\(file\.path\)!==file\.content\)\.length/)
  assert.match(executor,/builderOutcome:result\.ok\?'completed':'incomplete',\s*traceSteps:result\.trace\.length,\s*filesChanged,/)
  const store=readFileSync(new URL('../platform-harness/residency/supabase-store.ts',import.meta.url),'utf8')
  assert.match(store,/\.\.\.\(input\.metadata\?\{metadata:input\.metadata\}:\{\}\),/)
})
// end of saas/tests/builderResidencyLoopEvidence.node.test.ts (if this line is missing, the paste was cut short)
