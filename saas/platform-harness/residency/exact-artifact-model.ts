import type { SupabaseClient } from '@supabase/supabase-js'
import { provisionMassDistilledRuntime, canaryMassDistilledRuntime } from '../../lib/ai/cos/runpodMassDistilledProvisionV2.ts'

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

      // Residency precedes the final Production canary. Bind directly to the immutable
      // trained artifact in an isolated scale-to-zero/max-1 RunPod runtime instead of
      // requiring later-stage canary evidence (which would make the lifecycle circular).
      const provisioned=await provisionMassDistilledRuntime({
        candidateId,
        subjectId:'computer_science_coding',
        artifactId,
        artifactRevision:revisionKey,
        artifactHash,
        runtimeKey:'residency',
      })
      const endpointId=String(provisioned.endpointId||'').trim().toLowerCase()
      const modelId=String(provisioned.modelName||'').trim()
      if(!endpointId||!modelId) throw new Error('residency_exact_artifact_runtime_binding_missing')

      // Infrastructure-only prewarm/readiness. This does not write final-canary evidence
      // and therefore cannot satisfy or weaken any later graduation gate.
      const prewarm=await canaryMassDistilledRuntime({endpointId,modelName:modelId})
      if(!prewarm.ok) throw new Error(`residency_exact_artifact_runtime_not_ready:${prewarm.error||prewarm.httpStatus||'unknown'}`)

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
