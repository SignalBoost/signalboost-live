import type { SupabaseClient } from '@supabase/supabase-js'
import { callLocalModel, type LocalInferenceConfig } from '../../lib/ai/local-inference.ts'
import { configuredRunpodApiKey } from '../../lib/ai/cos/runpodConfig.ts'
import {
  servedCandidateModelFromCanary,
  type CanaryEventRow,
} from '../../lib/ai/cos/cosUniversityMassEvaluationServedModel.ts'
import type { BuilderAiPort } from '../../lib/builder/contracts.ts'

const HEX64=/^[a-f0-9]{64}$/i
const ENDPOINT=/^[a-z0-9_-]{3,120}$/i

export interface BuilderResidencyServingIdentity {
  candidateId:string
  artifactHash:string
  endpointId:string
  modelId:string
  baseUrl:string
  evidenceObservedAt:string
}

/**
 * Resolve only the technical serving identity already proven for THIS student artifact.
 * This is not graduate activation, an academic pass, or the post-Residency final canary.
 */
export async function resolveBuilderResidencyServingIdentity(input:{
  db:SupabaseClient
  candidateId:string
  artifactHash:string
}):Promise<BuilderResidencyServingIdentity>{
  const candidateId=String(input.candidateId||'').trim()
  const artifactHash=String(input.artifactHash||'').trim().toLowerCase()
  if(!candidateId||!HEX64.test(artifactHash)) throw new Error('residency_runtime_identity_invalid')

  const result=await input.db
    .from('cos_university_learning_assurance_events')
    .select('verifier,evidence,observed_at')
    .eq('event_type','fine_tune')
    .eq('candidate_id',candidateId)
    .eq('verifier','host_controller')
    .contains('evidence',{claim:'local_distilled_runtime_canary_passed',exactArtifact:true})
    .order('observed_at',{ascending:false})
    .limit(100)
  if(result.error) throw result.error

  const rows=(result.data??[]) as CanaryEventRow[]
  for(const row of rows){
    const endpointId=String(row.evidence?.endpointId||'').trim().toLowerCase()
    if(!ENDPOINT.test(endpointId)) continue
    if(String(row.evidence?.candidateId||'')!==candidateId) continue
    if(String(row.evidence?.artifactHash||'').toLowerCase()!==artifactHash) continue
    try{
      const modelId=servedCandidateModelFromCanary(rows,{candidateId,artifactHash,endpointId})
      return Object.freeze({
        candidateId,
        artifactHash,
        endpointId,
        modelId,
        baseUrl:`https://${endpointId}.api.runpod.ai/v1`,
        evidenceObservedAt:String(row.observed_at||''),
      })
    }catch{
      continue
    }
  }
  throw new Error('residency_runtime_exact_serving_identity_missing')
}

export function createExactArtifactResidencyBuilderAi(input:{
  identity:BuilderResidencyServingIdentity
  onInfrastructureFailure?:(code:string)=>void
  callModel?:typeof callLocalModel
  apiKey?:string
}):BuilderAiPort{
  const key=String(input.apiKey??configuredRunpodApiKey()??'').trim()
  if(!key) throw new Error('residency_runtime_runpod_key_missing')
  const call=input.callModel??callLocalModel
  const config:LocalInferenceConfig=Object.freeze({
    baseUrl:input.identity.baseUrl,
    model:input.identity.modelId,
    apiKey:key,
    timeoutMs:120_000,
    provider:'runpod',
    routeOwner:'itmounts',
  })

  return Object.freeze({
    async generate(request){
      try{
        const text=await call({
          systemPrompt:request.systemPrompt,
          prompt:request.prompt,
          maxTokens:request.maxTokens,
          temperature:0,
          jsonObject:true,
          disableThinking:true,
          timeoutMs:110_000,
          allowConfiguredFallback:false,
          usageContext:{
            feature:'builder_residency_exact_artifact',
            purpose:'practical_residency',
            agentId:input.identity.candidateId,
          },
        },config)
        if(!text?.trim()){
          input.onInfrastructureFailure?.('residency_exact_artifact_empty_response')
          throw new Error('residency_exact_artifact_empty_response')
        }
        return text
      }catch(error){
        const code=error instanceof Error?error.message:'residency_exact_artifact_inference_failed'
        input.onInfrastructureFailure?.(code)
        throw error
      }
    },
  })
}
