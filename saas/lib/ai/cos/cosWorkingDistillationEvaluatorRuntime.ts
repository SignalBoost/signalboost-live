import { readWorkingCosEvaluationAdmission, type WorkingCosEvaluationAdmission } from './cosWorkingDistillationEvaluationAdmission.ts'

const HEX64=/^[a-f0-9]{64}$/i
const clean=(v:unknown,n=1000)=>String(v??'').trim().slice(0,n)

export const WORKING_COS_EVALUATOR_RUNTIME_PROFILE='working_cos_independent_evaluator_runtime_v1' as const

export type WorkingCosEvaluatorRuntimeBinding=Readonly<{
  profile:typeof WORKING_COS_EVALUATOR_RUNTIME_PROFILE
  admission:WorkingCosEvaluationAdmission
  baseModelId:string
  baseModelRevision:string
  adapterModelId:string
  adapterRevision:string
  runtimeClass:'transformers_peft_exact_adapter'
  productionTrafficAuthorized:false
  authorityExpanded:false
}>

/**
 * The Working-COS student is a Qwen3-30B adapter and MUST NOT be sent through the 4B mass
 * evaluator runtime. This creates the immutable serving/evaluation binding consumed by the
 * dedicated evaluator runtime. No endpoint is provisioned and no spend is authorized here.
 */
export async function workingCosEvaluatorRuntimeBinding(input:{candidateId:string;artifactHash:string;db?:any}):Promise<WorkingCosEvaluatorRuntimeBinding>{
  const admission=await readWorkingCosEvaluationAdmission(input)
  const evidenceRef=clean(admission.artifactId,500)
  const match=/^([^@]+)@([a-f0-9]{40})$/i.exec(evidenceRef)
  if(!match)throw new Error('working_cos_evaluator_adapter_revision_missing')
  const [,adapterModelId,adapterRevision]=match
  if(!admission.baseModelId||!admission.baseModelRevision||!HEX64.test(admission.artifactHash))throw new Error('working_cos_evaluator_runtime_identity_invalid')
  return Object.freeze({
    profile:WORKING_COS_EVALUATOR_RUNTIME_PROFILE,
    admission,
    baseModelId:admission.baseModelId,
    baseModelRevision:admission.baseModelRevision,
    adapterModelId,
    adapterRevision:adapterRevision.toLowerCase(),
    runtimeClass:'transformers_peft_exact_adapter',
    productionTrafficAuthorized:false,
    authorityExpanded:false,
  })
}
