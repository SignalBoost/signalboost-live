import type { SupabaseClient } from '@supabase/supabase-js'
import { servedCandidateModelFromCanary, type CanaryEventRow } from '../../lib/ai/cos/cosUniversityMassEvaluationServedModel.ts'

export interface BuilderResidencyModelIdentity {
  candidateId:string
  artifactId:string
  artifactHash:string
  revisionKey:string
}

export interface BuilderResidencyModelPort {
  complete(input:{identity:BuilderResidencyModelIdentity;system:string;user:string;maxTokens?:number}):Promise<{
    text:string
    endpointId:string
    modelId:string
    exactArtifact:true
  }>
}

const ENDPOINT=/^[a-z0-9_-]{3,120}$/
const HASH=/^[a-f0-9]{64}$/

export function createRunpodBuilderResidencyModelPort(input:{
  db:SupabaseClient
  apiKey:string
  fetchImpl?:typeof fetch
  timeoutMs?:number
}):BuilderResidencyModelPort{
  const call=input.fetchImpl??fetch
  const timeoutMs=Math.max(1,Math.min(input.timeoutMs??120_000,180_000))
  return Object.freeze({
    async complete(request){
      const candidateId=String(request.identity.candidateId||'').trim()
      const artifactId=String(request.identity.artifactId||'').trim()
      const artifactHash=String(request.identity.artifactHash||'').trim().toLowerCase()
      const revisionKey=String(request.identity.revisionKey||'').trim().toLowerCase()
      if(!candidateId||!artifactId||!HASH.test(artifactHash)||!HASH.test(revisionKey)) throw new Error('residency_exact_artifact_identity_invalid')
      if(!input.apiKey.trim()) throw new Error('residency_runpod_key_missing')

      const events=await input.db.from('cos_university_learning_assurance_events')
        .select('verifier,evidence,observed_at')
        .eq('event_type','fine_tune')
        .eq('candidate_id',candidateId)
        .eq('verifier','host_controller')
        .contains('evidence',{claim:'local_distilled_runtime_canary_passed',exactArtifact:true})
        .order('observed_at',{ascending:false})
        .limit(100)
      if(events.error) throw events.error

      const rows=(events.data??[]) as CanaryEventRow[]
      let endpointId=''; let modelId=''
      for(const row of rows){
        const evidence=(row as any).evidence??{}
        const endpoint=String(evidence.endpointId||'').trim().toLowerCase()
        if(!ENDPOINT.test(endpoint)) continue
        if(String(evidence.candidateId||'')!==candidateId) continue
        if(String(evidence.artifactHash||'').toLowerCase()!==artifactHash) continue
        if(evidence.trainedArtifactId&&String(evidence.trainedArtifactId)!==artifactId) continue
        if(evidence.revisionKey&&String(evidence.revisionKey).toLowerCase()!==revisionKey) continue
        try{modelId=servedCandidateModelFromCanary(rows,{candidateId,artifactHash,endpointId:endpoint});endpointId=endpoint;break}catch{}
      }
      if(!endpointId||!modelId) throw new Error('residency_exact_canary_serving_identity_missing')

      const response=await call(`https://${endpointId}.api.runpod.ai/v1/chat/completions`,{
        method:'POST',
        headers:{Authorization:`Bearer ${input.apiKey}`,'Content-Type':'application/json'},
        body:JSON.stringify({
          model:modelId,
          temperature:0,
          max_tokens:Math.max(1,Math.min(request.maxTokens??2048,4096)),
          chat_template_kwargs:{enable_thinking:false},
          messages:[
            {role:'system',content:request.system},
            {role:'user',content:request.user},
          ],
        }),
        signal:AbortSignal.timeout(timeoutMs),
      })
      const raw=await response.text()
      if(!response.ok) throw new Error(`residency_exact_artifact_inference_http_${response.status}`)
      let parsed:any
      try{parsed=JSON.parse(raw)}catch{throw new Error('residency_exact_artifact_inference_invalid_json')}
      const text=String(parsed?.choices?.[0]?.message?.content||'').trim()
      if(!text) throw new Error('residency_exact_artifact_inference_empty')
      return Object.freeze({text,endpointId,modelId,exactArtifact:true as const})
    },
  })
}
