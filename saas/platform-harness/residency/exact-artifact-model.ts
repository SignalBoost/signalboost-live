// saas/platform-harness/residency/exact-artifact-model.ts
import type { SupabaseClient } from '@supabase/supabase-js'
import { MASS_DISTILLED_RESIDENCY_IDLE_TIMEOUT_SECONDS } from '../../lib/ai/cos/runpodMassDistilledProvisionV2.ts'
import { builderResidencyRuntimeKey } from '../../lib/ai/cos/cosUniversityGraduateEndpointProtection.ts'
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
  complete(input:{identity:BuilderResidencyModelIdentity;system:string;user:string;maxTokens?:number;signal?:AbortSignal}):Promise<{
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
const MAX_WAKE_ATTEMPTS=3
const EMPTY_HEALTH_POLLS_BEFORE_WAKE_RETRY=3
const APPLICATION_READY_TIMEOUT_MS=15_000

type ResidencyRuntimeArtifact=Readonly<{
  candidateId:string
  subjectId:string
  artifactId:string
  artifactRevision:string
  artifactHash:string
  runtimeKey?:string
  idleTimeoutSeconds?:number
}>

type ResidencyProvisionedRuntime=Readonly<{
  endpointId:string
  modelName:string
  baseUrl:string
  [key:string]:unknown
}>

type ResidencyRuntimeHealth=Readonly<{
  ok:boolean
  workers:{ready:number;[key:string]:unknown}
  error?:string|null
  [key:string]:unknown
}>

type ResidencyProvision=(artifact:ResidencyRuntimeArtifact)=>Promise<ResidencyProvisionedRuntime>
type ResidencyHealth=(endpointId:string)=>Promise<ResidencyRuntimeHealth>

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
  const key=builderResidencyRuntimeKey(identity.candidateId,identity.artifactHash)
  if(!key) throw new Error('residency_exact_artifact_identity_invalid')
  return key
}

function artifactRevision(evidenceRef:unknown):string{
  const match=/^hf:\/\/models\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+@([a-f0-9]{40})$/i
    .exec(String(evidenceRef??'').trim())
  return match?.[1]?.toLowerCase()??''
}

async function resolveResidencyArtifact(
  db:SupabaseClient,
  identity:BuilderResidencyModelIdentity,
):Promise<ResidencyRuntimeArtifact>{
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
    idleTimeoutSeconds:MASS_DISTILLED_RESIDENCY_IDLE_TIMEOUT_SECONDS,
  })
}

async function defaultSleep(ms:number){await new Promise(resolve=>setTimeout(resolve,ms))}

/**
 * The provider's rejection reason is part of the failure code. Production, 2026-09-26 21:52 UTC onward:
 * two different residents failed with a bare `residency_exact_artifact_inference_http_400` while the
 * response body — the only statement of WHY the served model rejected the request — was read and
 * discarded. Keep a bounded, redacted excerpt so the recorded case run explains itself.
 */
export function inferenceHttpFailureCode(status:number,raw:string):string{
  const code=`residency_exact_artifact_inference_http_${status}`
  let detail=''
  try{
    const parsed=JSON.parse(String(raw||''))
    detail=String(parsed?.message??parsed?.error?.message??parsed?.detail??parsed?.error??'')
  }catch{
    detail=String(raw||'')
  }
  const safe=detail
    .replace(/\b(bearer|token|secret|api[_-]?key|authorization)\b\s*[:=]?\s*[^,;\s]+/gi,'$1=[redacted]')
    .replace(/\s+/g,' ')
    .trim()
    .slice(0,180)
  return safe?`${code}:${safe}`:code
}

export function createRunpodBuilderResidencyModelPort(input:{
  db:SupabaseClient
  apiKey:string
  fetchImpl?:typeof fetch
  timeoutMs?:number
  readyTimeoutMs?:number
  provisionImpl?:ResidencyProvision
  healthImpl?:ResidencyHealth
  sleepImpl?:(ms:number)=>Promise<void>
}):BuilderResidencyModelPort{
  const call=input.fetchImpl??fetch
  const timeoutMs=Math.max(1,Math.min(input.timeoutMs??120_000,180_000))
  const readyTimeoutMs=Math.max(1,Math.min(input.readyTimeoutMs??READY_TIMEOUT_MS,420_000))
  const provision:ResidencyProvision=input.provisionImpl??(async artifact=>{
    const runtime=await import('../../lib/ai/cos/runpodMassDistilledProvisionV2.ts')
    return runtime.provisionMassDistilledRuntime(artifact)
  })
  const health:ResidencyHealth=input.healthImpl??(async endpointId=>{
    const runtime=await import('../../lib/ai/cos/runpodMassDistilledProvisionV2.ts')
    return runtime.massDistilledRuntimeHealth(endpointId)
  })
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
      let wakeAttempts=0
      const wakeRuntime=async()=>{
        wakeAttempts+=1
        try{
          const remaining=Math.max(1,deadline-Date.now())
          const wake=await call(`${root}/ping`,{
            headers:{Authorization:`Bearer ${input.apiKey}`},
            signal:AbortSignal.timeout(Math.min(WAKE_TIMEOUT_MS,remaining)),
          })
          if(wake.status===401||wake.status===403){
            throw new Error(`residency_exact_artifact_runtime_wake_http_${wake.status}`)
          }
        }catch(error){
          if(error instanceof Error&&/^residency_exact_artifact_runtime_wake_http_/.test(error.message)){
            throw error
          }
          // A scale-to-zero LB may reject or time out the first request before a worker is assigned.
          // The bounded retry below is allowed only while the provider still reports no worker at all.
        }
      }
      await wakeRuntime()

      let lastHealthError=''
      let emptyHealthPolls=0
      while(Date.now()<deadline){
        try{
          const state=await health(endpointId)
          const ready=Math.max(0,Number(state.workers?.ready??0))
          const running=Math.max(0,Number(state.workers?.running??0))
          const initializing=Math.max(0,Number(state.workers?.initializing??0))
          const idle=Math.max(0,Number(state.workers?.idle??0))
          if(state.ok){
            lastHealthError=`provider_workers_ready_${ready}_running_${running}_initializing_${initializing}_idle_${idle}_wake_attempts_${wakeAttempts}`
          }
          // Once RunPod reports an allocated running worker, probe the application directly
          // even if the provider has not promoted that worker to "ready" yet. This distinguishes
          // a control-plane readiness lag from an actual gateway/vLLM bootstrap failure.
          if(state.ok&&(ready>0||running>0)){
            try{
              const remaining=Math.max(1,deadline-Date.now())
              const application=await call(`${root}/ready`,{
                headers:{Authorization:`Bearer ${input.apiKey}`},
                signal:AbortSignal.timeout(
                  Math.min(APPLICATION_READY_TIMEOUT_MS,remaining),
                ),
              })
              if(application.status===401||application.status===403){
                throw new Error(
                  `residency_exact_artifact_runtime_ready_http_${application.status}`,
                )
              }
              const raw=await application.text()
              if(application.status===200){
                let parsed:any
                try{parsed=JSON.parse(raw)}catch{
                  throw new Error(
                    'residency_exact_artifact_runtime_ready_invalid_json',
                  )
                }
                if(
                  parsed?.ready===true&&
                  String(parsed?.model||'').trim()===modelId
                ){
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
                lastHealthError=
                  'residency_exact_artifact_application_model_not_ready'
              }else if(application.status===503){
                let detail=''
                try{detail=String(JSON.parse(raw)?.detail||'').trim()}catch{}
                if(detail.startsWith('distilled_bootstrap_failed:')){
                  const safe=detail
                    .replace(/\b(bearer|token|secret|api[_-]?key)\b\s*[:=]?\s*[^,;\s]+/gi,'$1=[redacted]')
                    .replace(/\s+/g,' ')
                    .slice(0,180)
                  throw new Error(
                    `residency_exact_artifact_runtime_not_ready:bootstrap_failed:${safe}`,
                  )
                }
                lastHealthError='residency_exact_artifact_runtime_ready_http_503'
              }else if(application.status!==204){
                lastHealthError=
                  `residency_exact_artifact_runtime_ready_http_${application.status}`
              }
            }catch(error){
              const message=error instanceof Error
                ?error.message
                :'residency_exact_artifact_application_ready_probe_failed'
              if(
                /^residency_exact_artifact_runtime_ready_http_(?:401|403)$/.test(
                  message,
                )||
                /^residency_exact_artifact_runtime_not_ready:bootstrap_failed:/.test(
                  message,
                )
              ){
                throw error
              }
              lastHealthError=`application_ready_probe:${message}`.slice(0,240)
            }
          }
          if(!state.ok&&state.error) lastHealthError=`provider_health:${String(state.error)}`.slice(0,240)

          if(state.ok&&ready===0&&running===0&&initializing===0&&idle===0){
            emptyHealthPolls+=1
            if(
              emptyHealthPolls>=EMPTY_HEALTH_POLLS_BEFORE_WAKE_RETRY&&
              wakeAttempts<MAX_WAKE_ATTEMPTS&&
              Date.now()<deadline
            ){
              await wakeRuntime()
              emptyHealthPolls=0
            }
          }else{
            emptyHealthPolls=0
          }
        }catch(error){
          const message=error instanceof Error
            ?error.message
            :'residency_exact_artifact_health_probe_failed'
          lastHealthError=`provider_health_probe:${message}`.slice(0,240)
        }
        await sleep(Math.min(READY_POLL_MS,Math.max(1,deadline-Date.now())))
      }
      throw new Error(
        lastHealthError
          ?`residency_exact_artifact_runtime_not_ready:${lastHealthError}`
          :'residency_exact_artifact_runtime_not_ready',
      )
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
        signal:request.signal
          ?AbortSignal.any([request.signal,AbortSignal.timeout(timeoutMs)])
          :AbortSignal.timeout(timeoutMs),
      })
      const raw=await response.text()
      if(!response.ok) throw new Error(inferenceHttpFailureCode(response.status,raw))
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
