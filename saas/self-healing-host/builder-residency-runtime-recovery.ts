import {
  dispatchRepairPlan,
  type RepairStep,
} from '../agent-gateway-host/supervisor-repair.ts'
import { createSignalBoostGatewayHost } from '../agent-gateway-host/signalboost-host.ts'
import {
  BUILDER_RESIDENCY_RUNTIME_RECOVERY_TARGET,
  isBuilderResidencyRuntimeRecoverableFailureCode,
} from '../agent-gateway-host/builder-residency-runtime-recovery.ts'
import { SELF_HEALING_GATEWAY_POLICY } from './self-healing-gateway-policy.ts'

export interface BuilderResidencyRuntimeSelfHealingResult{
  attempted:boolean
  completed:boolean
  failureCode:string
  message:string
  authorityExpanded:false
  computeWakeAuthorized:false
  modelInvocationAuthorized:false
  productionTrafficAuthorized:false
}

export async function actuateBuilderResidencyRuntimeRecovery(input:{
  runId:string
  candidateId:string
  artifactHash:string
  failureCode:string
}):Promise<BuilderResidencyRuntimeSelfHealingResult>{
  const failureCode=String(input.failureCode??'').trim().slice(0,500)
  if(!isBuilderResidencyRuntimeRecoverableFailureCode(failureCode)){
    return Object.freeze({
      attempted:false,
      completed:false,
      failureCode,
      message:'Residency infrastructure failure is not in the pre-authorized reversible recovery set.',
      authorityExpanded:false,
      computeWakeAuthorized:false,
      modelInvocationAuthorized:false,
      productionTrafficAuthorized:false,
    })
  }

  const repairPlan:readonly RepairStep[]=[Object.freeze({
    step:1,
    action:'Reconcile the existing exact-artifact Builder Residency runtime control plane.',
    executor:'api_executor',
    target:'exact Builder Residency RunPod runtime',
    expected_result:'The existing exact endpoint again satisfies the approved template, GPU, scale-to-zero, max-one-worker, and idle-timeout policy without creating resources or waking compute.',
    requires_approval:false,
  })]

  const dispatched=await dispatchRepairPlan({
    incident:{
      incident_id:`builder-residency-runtime:${input.runId}`,
      project:'signalboost-live',
      provider:'runpod',
    },
    repairPlan,
    policy:SELF_HEALING_GATEWAY_POLICY,
    host:createSignalBoostGatewayHost(),
    executionAttemptId:input.runId,
    resolveAction:()=>BUILDER_RESIDENCY_RUNTIME_RECOVERY_TARGET,
    resolveParams:()=>Object.freeze({
      candidateId:input.candidateId,
      artifactHash:input.artifactHash,
      failureCode,
    }),
    agentId:'cos-native-self-healing',
  })

  return Object.freeze({
    attempted:true,
    completed:dispatched.completed,
    failureCode,
    message:dispatched.completed
      ?'Registered Builder Residency runtime recovery completed through Agent Gateway governance.'
      :dispatched.stoppedAt?.reason??'Registered Builder Residency runtime recovery did not complete.',
    authorityExpanded:false,
    computeWakeAuthorized:false,
    modelInvocationAuthorized:false,
    productionTrafficAuthorized:false,
  })
}
