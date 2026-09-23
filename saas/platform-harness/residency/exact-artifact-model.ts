import { createHash } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  massDistilledRuntimeHealth,
  provisionMassDistilledRuntime,
  type MassDistilledRuntimeArtifact,
} from '../../lib/ai/cos/runpodMassDistilledProvisionV2.ts'

export interface BuilderResidencyModelIdentity {
  candidateId:string
  artifactId:string
  artifactHash:string
  revisionKey:string
}

export interface BuilderResidencyPreparedRuntime {
  endpointId:string
  modelId:string
  baseUrl:string
  artifactRevision:string
  exactArtifact:true
}

export interface BuilderResidencyModelPort {
  prepare?(identity:BuilderResidencyModelIdentity):Promise<BuilderResidencyPreparedRuntime>
  complete(input:{identity:BuilderResidencyModelIdentity;system:string;user:string;maxTokens?:number}):Promise<{
    text:string
    endpointId:string
    modelId:string
    exactArtifact:true
  }>
}

const HASH=/^[a-f0-9]{64}$/
const REVISION=/^[a-f0-9]{40}$/
const READY_TIMEOUT_MS=360_000
const READY_POLL_MS=3_000
const WAKE_TIMEOUT_MS=20_000

type ArtifactRow=Readonly<{
  candidate_id:string
  subject_id:string
  trained_artifact_id:string
  trained_artifact_hash:string
  revision_key:string
  evidence_ref:string
  status:string
  authority_expanded:boolean
}>

function runtimeKey(identity:BuilderResidencyModelIdentity):string{
  return createHash('sha256')
    .update(JSON.stringify([
      'builder-residency-runtime-v1',
      identity.candidateId,
      identity.artifactHash.toLowerCase(),
    ]))
    .digest('hex')
    .slice(0,10)
}

function artifactRevision(evidenceRef:unknown):string{
  const match=/^hf:\/\/models\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+@([a-f0-9]{40})$/i
    .exec(String(evidenceRef??'').trim())
  return match?.[1]?.toLowerCase()??''
}

async function resolveResidencyArtifact(
  db:SupabaseClient,
  identity:BuilderResidencyModelIdentity,
):Promise<MassDistilledRuntimeArtifact>{
  const candidateId=String(identity.candidateId||'').trim()
  const artifactId=String(identity.artifactId||'').trim()
  const artifactHash=String(identity.artifactHash||'').trim().toLowerCase()
  const revisionKey=String(identity.revisionKey||'').trim().toLowerCase()
  if(!candidateId.startsWith('mass:')||!artifactId||!HASH.test(artifactHash)||!HASH.test(revisionKey)){
    throw new Error('residency_exact_artifact_identity_invalid')
  }

  const result=await db.from('cos_local_distillation_artifacts')
    .select('candidate_id,subject_id,trained_artifact_id,trained_artifact_hash,revision_key,evidence_ref,status,authority_expanded')
    .eq('candidate_id',candidateId)
    .eq('trained_artifact_hash',artifactHash)
    .maybeSingle()
  if(result.error) throw result.error
  const row=result.data as ArtifactRow|null
  if(!row) throw new Error('residency_exact_artifact_registry_missing')
  if(
    String(row.trained_artifact_id)!==artifactId||
    String(row.revision_key).toLowerCase()!==revisionKey||
    String(row.status)!=='evaluation_pending'||
    row.authority_expanded===true
  ){
    throw new Error('residency_exact_artifact_registry_mismatch')
  }

  const revision=artifactRevision(row.evidence_ref)
  if(!REVISION.test(revision)) throw new Error('residency_exact_artifact_hf_revision_missing')

  return Object.freeze({
    candidateId,
    subjectId:String(row.subject_id||'').trim(),
    artifactId,
    artifactRevision:revision,
    artifactHash,
    runtimeKey:runtimeKey(identity),
  })
}

async function defaultSleep(ms:number){await new Promise(resolve=>setTimeout(resolve,ms))}

export function createRunpodBuilderResidencyModelPort(input:{
  db:SupabaseClient
  apiKey:string
  fetchImpl?:typeof fetch
  timeoutMs?:number
  readyTimeoutMs?:number
  provisionImpl?:typeof provisionMassDistilledRuntime
  healthImpl?:typeof massDistilledRuntimeHealth
  sleepImpl?:(ms:number)=>Promise<void>
}):BuilderResidencyModelPort{
  const call=input.fetchImpl??fetch
  const timeoutMs=Math.max(1,Math.min(input.timeoutMs??120_000,180_000))
  const readyTimeoutMs=Math.max(1,Math.min(input.readyTimeoutMs??READY_TIMEOUT_MS,420_000))
  const provision=input.provisionImpl??provisionMassDistilledRuntime
  const health=input.healthImpl??massDistilledRuntimeHealth
  const sleep=input.sleepImpl??defaultSleep
  let preparedKey=''
  let prepared:BuilderResidencyPreparedRuntime|null=null
  let preparing:Promise<BuilderResidencyPreparedRuntime>|null=null

  const prepare=async(identity:BuilderResidencyModelIdentity):Promise<BuilderResidencyPreparedRuntime>=>{
    const key=[
      identity.candidateId,
      identity.artifactId,
      identity.artifactHash.toLowerCase(),
      identity.revisionKey.toLowerCase(),
    ].join(':')
    if(prepared&&preparedKey===key) return prepared
    if(preparing&&preparedKey===key) return preparing
    preparedKey=key
    preparing=(async()=>{
      if(!input.apiKey.trim()) throw new Error('residency_runpod_key_missing')
      const artifact=await resolveResidencyArtifact(input.db,identity)
      const provisioned=await provision(artifact)
      const endpointId=String(provisioned.endpointId||'').trim()
      const modelId=String(provisioned.modelName||'').trim()
      const baseUrl=String(provisioned.baseUrl||'').trim()
      if(!endpointId||!modelId||!baseUrl){
        throw new Error('residency_exact_artifact_runtime_identity_missing')
      }

      const root=`https://${endpointId}.api.runpod.ai`
      const deadline=Date.now()+readyTimeoutMs
      try{
        const wake=await call(`${root}/ping`,{
          headers:{Authorization:`Bearer ${input.apiKey}`},
          signal:AbortSignal.timeout(Math.min(WAKE_TIMEOUT_MS,readyTimeoutMs)),
        })
        if(wake.status===401||wake.status===403){
          throw new Error(`residency_exact_artifact_runtime_wake_http_${wake.status}`)
        }
      }catch(error){
        if(error instanceof Error&&/^residency_exact_artifact_runtime_wake_http_/.test(error.message)){
          throw error
        }
        // A cold scale-to-zero LB commonly times out while RunPod starts a worker.
        // Readiness is authoritatively observed through the provider health plane below.
      }

      while(Date.now()<deadline){
        const state=await health(endpointId)
        if(state.ok&&state.workers.ready>0){
          const result=Object.freeze({
            endpointId,
            modelId,
            baseUrl,
            artifactRevision:artifact.artifactRevision,
            exactArtifact:true as const,
          })
          prepared=result
          return result
        }
        await sleep(Math.min(READY_POLL_MS,Math.max(1,deadline-Date.now())))
      }
      throw new Error('residency_exact_artifact_runtime_not_ready')
    })()
    try{return await preparing}
    finally{preparing=null}
  }

  return Object.freeze({
    prepare,
    async complete(request){
      const runtime=await prepare(request.identity)
      const response=await call(`${runtime.baseUrl}/chat/completions`,{
        method:'POST',
        headers:{Authorization:`Bearer ${input.apiKey}`,'Content-Type':'application/json'},
        body:JSON.stringify({
          model:runtime.modelId,
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
      return Object.freeze({
        text,
        endpointId:runtime.endpointId,
        modelId:runtime.modelId,
        exactArtifact:true as const,
      })
    },
  })
}
