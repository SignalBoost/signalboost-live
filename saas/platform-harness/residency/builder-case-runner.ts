// saas/platform-harness/residency/builder-case-runner.ts
import { createHash } from 'node:crypto'
import type { HarnessAuthorityEnvelope, HarnessRunResult } from '../core/types.ts'
import { resolveHarnessManifest } from '../core/policy.ts'
import { createBuilderResidencyHarnessRequest } from '../adapters/builder.ts'
import type { HarnessEvidenceSink } from '../evidence/durable-evidence.ts'
import { completeHarnessRun } from '../runtime/completion.ts'
import type { BuilderResidencyCase } from '../cases/builder-residency.ts'

const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex')

/**
 * The resident's loop as a content-free shape (2026-10-07): each step is `tool:ok` or `tool:<error class>`, consecutive
 * repeats are run-length encoded (`read_file:builder_repeated_tool_call x5`). It carries no paths, inputs, file content,
 * command output or model text, so practice-case material cannot leak. Production: 61 of 63 failed cases had no stop
 * reason recorded, and the recent ones stop as builder_stalled_repeated_inspection; the shape tells a resident that
 * repeats one identical call (a skill or protocol problem) from a guard that rejects a new call (a harness problem, as
 * the 2026-10-06 forced-read defect was).
 */
export const BUILDER_LOOP_SHAPE_MAX_CHARS=400
export function builderLoopShape(trace:unknown):string|null{
  if(!Array.isArray(trace)||!trace.length) return null
  const steps=trace.map(item=>{
    const entry=(item&&typeof item==='object'?item:{}) as {toolId?:unknown;ok?:unknown;error?:unknown}
    const tool=/^[a-z_]{1,40}$/.test(String(entry.toolId??''))?String(entry.toolId):'unknown'
    if(entry.ok===true) return `${tool}:ok`
    const errorClass=/^[a-z][a-z0-9_]{0,59}/.exec(String(entry.error??''))?.[0]
    return `${tool}:${tool==='run'&&!errorClass?.startsWith('builder_')?'fail':errorClass||'error'}`
  })
  const runs:string[]=[]
  for(let index=0;index<steps.length;){
    let end=index
    while(end+1<steps.length&&steps[end+1]===steps[index]) end+=1
    const count=end-index+1
    runs.push(count>1?`${steps[index]} x${count}`:steps[index])
    index=end+1
  }
  const shape=runs.join(' > ')
  return shape.length>BUILDER_LOOP_SHAPE_MAX_CHARS?`${shape.slice(0,BUILDER_LOOP_SHAPE_MAX_CHARS-1)}…`:shape
}

/**
 * The resident's own work loop, as the executor observed it (2026-10-05): did it finish, why it stopped, how many steps,
 * how many seed files it changed. Production: 128 counted Residency failures were all `residency_proof_exit_1`, which
 * cannot tell a wrong fix from a resident that ran out of time before editing. Recorded on the case run's existing
 * metadata column; it changes no outcome, score or attribution.
 */
export function builderLoopMetadata(trajectory:unknown):Readonly<Record<string,unknown>>|undefined{
  const events=Array.isArray(trajectory)?trajectory:[]
  for(let index=events.length-1;index>=0;index-=1){
    const data=(events[index] as {kind?:unknown;data?:Record<string,unknown>}|null)?.data
    if((events[index] as {kind?:unknown})?.kind!=='observation'||!data||!('builderOutcome' in data)) continue
    const count=(value:unknown)=>typeof value==='number'&&Number.isFinite(value)?value:null
    return Object.freeze({builderLoop:Object.freeze({
      outcome:String(data.builderOutcome),
      failureCode:typeof data.failureCode==='string'?data.failureCode.slice(0,120):null,
      traceSteps:count(data.traceSteps),
      filesChanged:count(data.filesChanged),
      shape:typeof data.loopShape==='string'?data.loopShape.slice(0,BUILDER_LOOP_SHAPE_MAX_CHARS):null,
    })})
  }
  return undefined
}

export interface BuilderResidencyExactArtifactExecutor {
  run(input:{
    request:ReturnType<typeof createBuilderResidencyHarnessRequest>
    authority:HarnessAuthorityEnvelope
    practiceCase:BuilderResidencyCase
    candidateId?:string
  }):Promise<HarnessRunResult>
}

export interface BuilderResidencyEvidenceStore {
  startCase(input:{
    residencyId:string
    runId:string
    caseFamily:string
    variantHash:string
    competencyId:string
    artifactHash:string
    environmentId:string
  }):Promise<{caseRunId:string}>
  finishCase(input:{
    caseRunId:string
    status:'passed'|'failed'|'rejected'
    harnessOutcome:string
    verifierRef?:string
    trajectoryHash?:string
    evidenceHash?:string
    failureCode?:string
    metadata?:Readonly<Record<string,unknown>>
  }):Promise<void>
  recordCompetency(input:{
    residencyId:string
    caseRunId:string
    competencyId:string
    caseFamily:string
    variantHash:string
    trajectoryHash:string
    evidenceHash:string
    outcome:'pass'|'fail'
    observedAt:string
  }):Promise<void>
}

export async function runBuilderResidencyCase(input:{
  residencyId:string
  candidateId:string
  subjectId:string
  tenantId:string
  portableId:string
  agentId:string
  artifactId:string
  artifactHash:string
  artifactRevision?:string
  sandboxEnvironmentId:string
  authority:HarnessAuthorityEnvelope
  practiceCase:BuilderResidencyCase
  requestedCapabilities?:readonly string[]
  executor:BuilderResidencyExactArtifactExecutor
  harnessEvidenceSink:HarnessEvidenceSink
  store:BuilderResidencyEvidenceStore
  now?:()=>Date
}){
  const now=input.now??(()=>new Date())
  // Every infrastructure retry is a distinct auditable attempt. Competency evidence remains
  // unique by residency+competency+variant and is written only after pedagogical acceptance.
  const attemptId=now().getTime().toString(36)
  const runId=`residency:${input.residencyId}:${input.practiceCase.variantHash.slice(0,16)}:${attemptId}`
  const request=createBuilderResidencyHarnessRequest({
    runId,
    objective:input.practiceCase.objective,
    tenantId:input.tenantId,
    portableId:input.portableId,
    agentId:input.agentId,
    artifactId:input.artifactId,
    artifactHash:input.artifactHash,
    artifactRevision:input.artifactRevision,
    sandboxEnvironmentId:input.sandboxEnvironmentId,
    requestedCapabilities:input.requestedCapabilities,
  })
  const policy=resolveHarnessManifest(request,input.authority)
  if(policy.allowed===false) return Object.freeze({ok:false,reason:'residency_manifest_rejected',blockers:policy.reasons})

  const started=await input.store.startCase({
    residencyId:input.residencyId,
    runId,
    caseFamily:input.practiceCase.caseFamily,
    variantHash:input.practiceCase.variantHash,
    competencyId:input.practiceCase.competencyId,
    artifactHash:input.artifactHash,
    environmentId:input.sandboxEnvironmentId,
  })

  let result:HarnessRunResult
  try{
    result=await input.executor.run({
      request,
      authority:input.authority,
      practiceCase:input.practiceCase,
      candidateId:input.candidateId,
    })
  }catch{
    await input.store.finishCase({
      caseRunId:started.caseRunId,
      status:'rejected',
      harnessOutcome:'harness_failure',
      failureCode:'residency_exact_artifact_executor_failed',
    })
    return Object.freeze({ok:false,reason:'residency_exact_artifact_executor_failed'})
  }

  let completion
  try{
    completion=await completeHarnessRun({
      manifest:policy.manifest,
      result,
      evidenceSink:input.harnessEvidenceSink,
      universityContext:{
        candidateId:input.candidateId,
        subjectId:input.subjectId,
        caseFamily:input.practiceCase.caseFamily,
        variantHash:input.practiceCase.variantHash,
        competencyId:input.practiceCase.competencyId,
        requestedState:'demonstrated',
        finalExamMaterialUsed:false,
      },
    })
  }catch{
    await input.store.finishCase({
      caseRunId:started.caseRunId,
      status:'rejected',
      harnessOutcome:result.outcome.status,
      verifierRef:result.outcome.verifierRef,
      failureCode:'residency_harness_completion_failed',
    })
    return Object.freeze({ok:false,reason:'residency_harness_completion_failed',result})
  }

  const trajectoryHash=hash(result.trajectory)
  const observedAt=now().toISOString()
  const metadata=builderLoopMetadata(result.trajectory)

  if(completion.route.destination!=='university'){
    await input.store.finishCase({
      caseRunId:started.caseRunId,
      status:'rejected',
      harnessOutcome:result.outcome.status,
      verifierRef:result.outcome.verifierRef,
      trajectoryHash,
      failureCode:result.outcome.failureCode??`residency_routed_${completion.route.destination}`,
      metadata,
    })
    return Object.freeze({
      ok:false,
      reason:`residency_routed_${completion.route.destination}`,
      result,
      route:completion.route,
    })
  }

  const adapted=completion.route.decision
  if(!adapted.accepted||!adapted.evidenceHash){
    await input.store.finishCase({
      caseRunId:started.caseRunId,
      status:'rejected',
      harnessOutcome:result.outcome.status,
      verifierRef:result.outcome.verifierRef,
      trajectoryHash,
      failureCode:adapted.blockers[0]??result.outcome.failureCode??'residency_evidence_rejected',
      metadata,
    })
    return Object.freeze({ok:false,reason:'residency_evidence_rejected',blockers:adapted.blockers,result})
  }

  const outcome:'pass'|'fail'=adapted.route==='remediation'?'fail':'pass'
  await input.store.recordCompetency({
    residencyId:input.residencyId,
    caseRunId:started.caseRunId,
    competencyId:input.practiceCase.competencyId,
    caseFamily:input.practiceCase.caseFamily,
    variantHash:input.practiceCase.variantHash,
    trajectoryHash,
    evidenceHash:adapted.evidenceHash,
    outcome,
    observedAt,
  })
  await input.store.finishCase({
    caseRunId:started.caseRunId,
    status:outcome==='pass'?'passed':'failed',
    harnessOutcome:result.outcome.status,
    verifierRef:result.outcome.verifierRef,
    trajectoryHash,
    evidenceHash:adapted.evidenceHash,
    failureCode:result.outcome.failureCode,
    metadata,
  })

  return Object.freeze({
    ok:true,
    runId,
    caseRunId:started.caseRunId,
    outcome,
    route:adapted.route,
    competencyState:adapted.competencyState,
    evidenceHash:adapted.evidenceHash,
    result,
  })
}
// end of saas/platform-harness/residency/builder-case-runner.ts (if this line is missing, the paste was cut short)
