import { createHash } from 'node:crypto'
import type { HarnessAuthorityEnvelope, HarnessRunResult } from '../core/types.ts'
import { resolveHarnessManifest } from '../core/policy.ts'
import { createBuilderResidencyHarnessRequest } from '../adapters/builder.ts'
import type { HarnessEvidenceSink } from '../evidence/durable-evidence.ts'
import { completeHarnessRun } from '../runtime/completion.ts'
import type { BuilderResidencyCase } from '../cases/builder-residency.ts'

const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex')

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
  const runId=`residency:${input.residencyId}:${input.practiceCase.variantHash.slice(0,16)}`
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

  if(completion.route.destination!=='university'){
    await input.store.finishCase({
      caseRunId:started.caseRunId,
      status:'rejected',
      harnessOutcome:result.outcome.status,
      verifierRef:result.outcome.verifierRef,
      trajectoryHash,
      failureCode:result.outcome.failureCode??`residency_routed_${completion.route.destination}`,
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
