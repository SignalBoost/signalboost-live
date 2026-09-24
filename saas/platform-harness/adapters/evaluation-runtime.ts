// saas/platform-harness/adapters/evaluation-runtime.ts
import type { HarnessLimits, HarnessManifest, HarnessRunRequest } from '../core/types.ts'
import { resolveHarnessManifest } from '../core/policy.ts'
import {
  currentHarnessExecutionContext,
  withHarnessExecutionContext,
} from '../runtime/execution-context.ts'

/**
 * Controlled execution environment for an external independent evaluator.
 * The Harness supplies runtime isolation only: it does not define exam material,
 * decide scores, graduate artifacts, or feed evaluation output back into training.
 */
export function createEvaluationRuntimeHarnessRequest(input:{runId:string;objective:string;tenantId:string;portableId:string;agentId:string;artifactId:string;artifactHash:string;artifactRevision?:string;environmentId:string;fixtureHash:string;capabilities:readonly string[];limits?:HarnessLimits}):HarnessRunRequest {
  return Object.freeze({
    runId:input.runId,
    objective:input.objective,
    identity:Object.freeze({agentId:input.agentId,role:'evaluation_candidate',tenantId:input.tenantId,portableId:input.portableId,artifact:Object.freeze({artifactId:input.artifactId,artifactHash:input.artifactHash,...(input.artifactRevision?{revision:input.artifactRevision}:{})})}),
    profile:'evaluation_runtime',
    environment:Object.freeze({environmentId:input.environmentId,class:'sandbox',fixtureHash:input.fixtureHash}),
    requestedCapabilities:Object.freeze([...input.capabilities]),
    requestedLimits:Object.freeze({maxToolCalls:500,deadlineMs:60*60_000,maxConcurrency:1,...(input.limits??{})}),
  })
}

export type EvaluationRuntimeHarnessInput = Readonly<{
  runId:string
  objective:string
  tenantId:string
  portableId:string
  agentId:string
  artifactId:string
  artifactHash:string
  artifactRevision?:string
  environmentId:string
  fixtureHash:string
  limits?:HarnessLimits
}>

function assertEvaluationRuntimeManifest(manifest:HarnessManifest):void {
  if (manifest.profile !== 'evaluation_runtime' || manifest.environment.class !== 'sandbox') {
    throw new Error('evaluation_runtime_harness_manifest_invalid')
  }
}

/**
 * Mandatory live ingress for independent evaluation/training exercises.
 *
 * This is intentionally a zero-capability envelope. It creates no provider/tool/spend
 * authority; those remain with the caller's independently verified academic claim,
 * evaluator secret, call budget and exact-artifact controls. The envelope binds exact
 * learner/artifact/fixture identity plus the absolute Harness deadline/cancellation signal
 * before any model/provider execution can begin.
 */
export async function withEvaluationRuntimeHarness<T>(
  input:EvaluationRuntimeHarnessInput,
  operation:()=>Promise<T>,
):Promise<T> {
  const existing=currentHarnessExecutionContext()
  if(existing){
    if(existing.manifest.profile!=='evaluation_runtime'){
      throw new Error('evaluation_runtime_harness_profile_conflict')
    }
    assertEvaluationRuntimeManifest(existing.manifest)
    const artifact=existing.manifest.identity.artifact
    const fixtureHash=String(existing.manifest.environment.fixtureHash??'')
    if(
      existing.manifest.identity.agentId!==input.agentId
      || artifact?.artifactId!==input.artifactId
      || artifact?.artifactHash!==input.artifactHash
      || String(artifact?.revision??'')!==String(input.artifactRevision??'')
      || existing.manifest.environment.environmentId!==input.environmentId
      || fixtureHash!==input.fixtureHash
    ){
      throw new Error('evaluation_runtime_harness_identity_conflict')
    }
    return operation()
  }

  const request=createEvaluationRuntimeHarnessRequest({...input,capabilities:[]})
  const requestedDeadlineMs=Number(request.requestedLimits?.deadlineMs)
  const absoluteDeadlineMs=Number.isFinite(requestedDeadlineMs)
    ? Math.max(1,Math.min(60*60_000,requestedDeadlineMs))
    : 60*60_000
  const decision=resolveHarnessManifest({
    ...request,
    deadlineAt:new Date(Date.now()+absoluteDeadlineMs).toISOString(),
  },{
    manifestRef:`host://evaluation-runtime/${String(input.runId||'run').slice(0,160)}`,
    verified:true,
    verifiedBy:'host',
    environments:['sandbox'],
    capabilities:[],
    limits:{maxToolCalls:0,maxConcurrency:1,...(input.limits??{})},
  })
  if(decision.allowed===false){
    throw new Error(`evaluation_runtime_harness_denied:${decision.reasons.join(',')}`)
  }
  assertEvaluationRuntimeManifest(decision.manifest)

  const controller=new AbortController()
  const deadlineAt=decision.manifest.deadlineAt?Date.parse(decision.manifest.deadlineAt):NaN
  const relativeDeadlineMs=Number(decision.manifest.limits.deadlineMs)
  const remaining=Number.isFinite(deadlineAt)
    ? Math.max(0,deadlineAt-Date.now())
    : Number.isFinite(relativeDeadlineMs)
      ? Math.max(0,relativeDeadlineMs)
      : null
  let timer:ReturnType<typeof setTimeout>|undefined
  if(remaining!==null){
    if(remaining<=0) controller.abort('harness_deadline_exceeded')
    else timer=setTimeout(()=>controller.abort('harness_deadline_exceeded'),remaining)
  }

  try{
    return await withHarnessExecutionContext(decision.manifest,controller.signal,operation)
  }finally{
    if(timer) clearTimeout(timer)
  }
}
