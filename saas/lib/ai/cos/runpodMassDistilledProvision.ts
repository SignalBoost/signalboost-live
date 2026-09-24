// Dynamic exact-artifact RunPod canary support for mass-distilled students.
import { configuredRunpodApiKey } from './runpodConfig.ts'
import { protectedRunpodEndpointIds } from './cosUniversityGraduateEndpointProtection.ts'

const REST_V1 = 'https://rest.runpod.io/v1'
const CONTROL_API_V2 = 'https://api.runpod.io/v2'
const GRAPHQL_API = 'https://api.runpod.io/graphql'
const SERVERLESS_API = 'https://api.runpod.ai/v2'
const VLLM_IMAGE = 'vllm/vllm-openai:v0.29.0'
const BASE_MODEL_ID = 'Qwen/Qwen3-4B'
const BASE_MODEL_REVISION = '1cfa9a7208912126459214e8b04321603b3df60c'
const BASE_MODEL_REFERENCE = `https://huggingface.co/${BASE_MODEL_ID}:${BASE_MODEL_REVISION}`
const ROUTING = 'LOAD_BALANCER' as const
const PUBLIC_PORT = 8000
const IDLE_TIMEOUT_SECONDS = 60
// Production 2026-09-22: two replay-trained exact artifacts reached a healthy RunPod worker but
// internal vLLM was still loading at the old 235-second cutoff. The gateway itself permits up to
// 300 seconds of internal bootstrap after the worker becomes routable, so the old route budget
// could expire before the model's own bounded startup contract. Allow 380 seconds for readiness;
// the cron route remains below the 8-minute database reservation lifetime, and worst-case GPU cost
// still stays far below the unchanged $0.20 per-canary authorization.
const READY_TIMEOUT_MS = 380_000
const CANARY_TIMEOUT_MS = 35_000
const MAX_GPU_PRICE_USD = 0.69
const REQUEST_TIMEOUT_MS = 8_000
const HEALTH_TIMEOUT_MS = 5_000
const ENDPOINT_VISIBILITY_ATTEMPTS = 12
const ENDPOINT_VISIBILITY_RETRY_MS = 2_000
const APPROVED_POOLS = ['AMPERE_16', 'AMPERE_24'] as const

export type MassDistilledRuntimeArtifact = Readonly<{
  candidateId: string
  subjectId: string
  artifactId: string
  artifactRevision: string
  artifactHash: string
  /** Host-derived approval-scoped key. It isolates a fresh provider runtime after a preflight failure. */
  runtimeKey?: string
  /** Optional bounded idle window for a caller that needs one warm retry. Defaults to the canary policy. */
  idleTimeoutSeconds?: number
}>

type Template = { id:string; name:string; imageName?:string; isServerless?:boolean; dockerEntrypoint?:string[]; dockerStartCmd?:string[]; ports?:string[] }
type Endpoint = { id:string; name:string; type?:'QUEUE'|'LOAD_BALANCER'; templateId?:string; workers?:{min?:number;max?:number;idleTimeout?:number}; gpu?:{pools?:string[];count?:number} }
type RestEndpointIdentity = { id?:string; name?:string }
type Gpu = { pool?:string; manufacturer?:string; memory?:number; availability?:string; price?:{serverless?:number|null} }

const HEX40 = /^[a-f0-9]{40}$/i
const HEX64 = /^[a-f0-9]{64}$/i
const clean = (value:unknown,max=300)=>String(value??'').replace(/\s+/g,' ').trim().slice(0,max)

function safeError(raw:string):string|null{
  try{
    const value:any=JSON.parse(raw)
    const detail=[value?.message,value?.detail,typeof value?.error==='string'?value.error:null,value?.error?.message].map(item=>clean(item)).find(Boolean)||''
    return detail?detail.replace(/\b(bearer|token|secret|api[_-]?key)\b\s*[:=]?\s*[^,;\s]+/gi,'$1=[redacted]').slice(0,300):null
  }catch{return null}
}

async function requestV1<T>(path:string,init:RequestInit={}):Promise<T>{
  const key=configuredRunpodApiKey(); if(!key) throw new Error('RUNPOD_API_KEY is not configured')
  const response=await fetch(`${REST_V1}${path}`,{...init,headers:{Authorization:`Bearer ${key}`,...(init.body?{'Content-Type':'application/json'}:{}),...(init.headers||{})},signal:AbortSignal.timeout(REQUEST_TIMEOUT_MS)})
  const raw=await response.text(); if(!response.ok) throw new Error(`RunPod REST v1 ${String(init.method||'GET').toUpperCase()} ${path} HTTP ${response.status}${safeError(raw)?`: ${safeError(raw)}`:''}`)
  return raw?JSON.parse(raw) as T:{} as T
}

async function requestV2<T>(path:string,init:RequestInit={}):Promise<T>{
  const key=configuredRunpodApiKey(); if(!key) throw new Error('RUNPOD_API_KEY is not configured')
  const response=await fetch(`${CONTROL_API_V2}${path}`,{...init,headers:{Authorization:`Bearer ${key}`,...(init.body?{'Content-Type':'application/json'}:{}),...(init.headers||{})},signal:AbortSignal.timeout(REQUEST_TIMEOUT_MS)})
  const raw=await response.text(); if(!response.ok) throw new Error(`RunPod REST v2 ${String(init.method||'GET').toUpperCase()} ${path} HTTP ${response.status}${safeError(raw)?`: ${safeError(raw)}`:''}`)
  return raw?JSON.parse(raw) as T:{} as T
}

async function requestGraphQl<T>(query:string,variables:Record<string,unknown>):Promise<T>{
  const key=configuredRunpodApiKey(); if(!key) throw new Error('RUNPOD_API_KEY is not configured')
  const response=await fetch(`${GRAPHQL_API}?api_key=${encodeURIComponent(key)}`,{
    method:'POST',
    headers:{'Content-Type':'application/json','User-Agent':'Mozilla/5.0 (compatible; SignalBoost/1.0)'},
    body:JSON.stringify({query,variables}),
    signal:AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  const raw=await response.text()
  if(!response.ok) throw new Error(`RunPod GraphQL HTTP ${response.status}${safeError(raw)?`: ${safeError(raw)}`:''}`)
  let payload:{data?:T;errors?:Array<{message?:unknown}>}={}
  try{payload=raw?JSON.parse(raw):{}}catch{throw new Error('RunPod GraphQL response was not valid JSON')}
  if(payload.errors?.length) throw new Error(`RunPod GraphQL error: ${clean(payload.errors[0]?.message,300)||'unknown error'}`)
  if(!payload.data) throw new Error('RunPod GraphQL response carried no data')
  return payload.data
}

const MAX_CALLER_IDLE_TIMEOUT_SECONDS = 300

function artifactIdleTimeoutSeconds(input:MassDistilledRuntimeArtifact){
  if(input.idleTimeoutSeconds===undefined) return IDLE_TIMEOUT_SECONDS
  const value=Number(input.idleTimeoutSeconds)
  if(!Number.isInteger(value)||value<IDLE_TIMEOUT_SECONDS||value>MAX_CALLER_IDLE_TIMEOUT_SECONDS){
    throw new Error('mass_distilled_runtime_idle_timeout_invalid')
  }
  return value
}

function assertArtifact(input:MassDistilledRuntimeArtifact){
  if(!input.candidateId.startsWith('mass:')||!input.artifactId||!HEX40.test(input.artifactRevision)||!HEX64.test(input.artifactHash)) throw new Error('mass_distilled_runtime_artifact_invalid')
  artifactIdleTimeoutSeconds(input)
}

function identity(input:MassDistilledRuntimeArtifact){
  const suffix=input.artifactHash.slice(0,12).toLowerCase()
  const runtimeKey=clean(input.runtimeKey,32).toLowerCase().replace(/[^a-z0-9]/g,'').slice(0,10)
  if(runtimeKey){
    return {templateName:`itmounts-mass-distilled-${suffix}-${runtimeKey}-template-v4`,endpointName:`itmounts-mass-distilled-${suffix}-${runtimeKey}-v3`,modelName:`itmounts-mass-distilled-${suffix}-${runtimeKey}`}
  }
  // Backward-compatible identity for historical callers. New approved canaries always provide runtimeKey.
  return {templateName:`itmounts-mass-distilled-${suffix}-v2`,endpointName:`itmounts-mass-distilled-${suffix}-v2`,modelName:`itmounts-mass-distilled-${suffix}`}
}

function gatewaySource(){return String.raw`import asyncio, json, os
from pathlib import Path
import httpx, uvicorn
from fastapi import FastAPI, HTTPException, Request, Response
from huggingface_hub import snapshot_download
BASE_ID=os.environ['ITMOUNTS_BASE_MODEL_ID']; BASE_REV=os.environ['ITMOUNTS_BASE_MODEL_REVISION']
ADAPTER_ID=os.environ['ITMOUNTS_ADAPTER_MODEL_ID']; ADAPTER_REV=os.environ['ITMOUNTS_ADAPTER_MODEL_REVISION']
MODEL=os.environ['ITMOUNTS_DISTILLED_MODEL_NAME']; TOKEN=os.environ['HF_TOKEN']; INTERNAL=8001
app=FastAPI(); ready=asyncio.Event(); bootstrap_error=None; proc=None
def cached_base():
    org,name=BASE_ID.split('/',1); p=Path('/runpod-volume/huggingface-cache/hub')/f'models--{org}--{name}'/'snapshots'/BASE_REV
    return str(p) if p.is_dir() else None
async def bootstrap():
    global bootstrap_error,proc
    try:
        base=cached_base() or await asyncio.to_thread(snapshot_download,repo_id=BASE_ID,revision=BASE_REV,local_dir='/models/base',token=TOKEN)
        adapter=await asyncio.to_thread(snapshot_download,repo_id=ADAPTER_ID,revision=ADAPTER_REV,local_dir='/models/adapter',token=TOKEN)
        lora=json.dumps({'name':MODEL,'path':adapter,'base_model_name':BASE_ID})
        proc=await asyncio.create_subprocess_exec('vllm','serve',base,'--host','127.0.0.1','--port',str(INTERNAL),'--served-model-name',BASE_ID,'--enable-lora','--max-lora-rank','16','--max-loras','1','--max-cpu-loras','1','--lora-modules',lora,'--gpu-memory-utilization','0.85','--max-model-len','8192','--dtype','auto','--enforce-eager')
        async with httpx.AsyncClient(timeout=2.0) as client:
            for _ in range(300):
                if proc.returncode is not None: raise RuntimeError(f'vllm_exited_{proc.returncode}')
                # Surface a bootstrap failure promptly instead of leaving RunPod health at 204 until the outer readiness deadline.
                try:
                    r=await client.get(f'http://127.0.0.1:{INTERNAL}/health')
                    if r.status_code==200: ready.set(); return
                except Exception: pass
                await asyncio.sleep(1)
        raise TimeoutError('vllm_internal_health_timeout')
    except Exception as exc: bootstrap_error=f'{type(exc).__name__}:{str(exc)[:240]}'
@app.on_event('startup')
async def start(): asyncio.create_task(bootstrap())
@app.get('/ping')
async def ping():
    if bootstrap_error: raise HTTPException(status_code=503,detail=f'distilled_bootstrap_failed:{bootstrap_error}')
    if not ready.is_set(): return Response(status_code=204)
    return {'status':'ready','modelReady':True,'model':MODEL}
@app.get('/ready')
async def is_ready():
    if bootstrap_error: raise HTTPException(status_code=503,detail=f'distilled_bootstrap_failed:{bootstrap_error}')
    if not ready.is_set(): return Response(status_code=204)
    return {'ready':True,'model':MODEL}
async def proxy(req,path):
    if not ready.is_set(): raise HTTPException(status_code=503,detail='distilled_internal_vllm_not_ready')
    body=await req.body()
    if path=='/v1/chat/completions':
        try:
            payload=json.loads(body)
        except Exception:
            raise HTTPException(status_code=400,detail='distilled_chat_payload_invalid')
        kwargs=payload.get('chat_template_kwargs')
        if not isinstance(kwargs,dict): kwargs={}
        kwargs['enable_thinking']=False
        payload['chat_template_kwargs']=kwargs
        body=json.dumps(payload).encode('utf-8')
    async with httpx.AsyncClient(timeout=120.0) as client: r=await client.request(req.method,f'http://127.0.0.1:{INTERNAL}{path}',content=body,headers={'content-type':'application/json'})
    return Response(content=r.content,status_code=r.status_code,media_type=r.headers.get('content-type','application/json'))
@app.post('/v1/chat/completions')
async def chat(req:Request): return await proxy(req,'/v1/chat/completions')
if __name__=='__main__': uvicorn.run(app,host='0.0.0.0',port=8000)`}

function startupCommand(input:MassDistilledRuntimeArtifact,modelName:string){
  const gateway=Buffer.from(gatewaySource(),'utf8').toString('base64')
  return ['set -euo pipefail','mkdir -p /models/base /models/adapter /models/hf-cache',`export ITMOUNTS_BASE_MODEL_ID='${BASE_MODEL_ID}'`,`export ITMOUNTS_BASE_MODEL_REVISION='${BASE_MODEL_REVISION}'`,`export ITMOUNTS_ADAPTER_MODEL_ID='${input.artifactId}'`,`export ITMOUNTS_ADAPTER_MODEL_REVISION='${input.artifactRevision}'`,`export ITMOUNTS_DISTILLED_MODEL_NAME='${modelName}'`,`python3 -c "import base64;open('/tmp/itmounts_mass_gateway.py','wb').write(base64.b64decode('${gateway}'))"`,'exec python3 /tmp/itmounts_mass_gateway.py'].join('; ')
}

function templateMatches(template:Template,input:MassDistilledRuntimeArtifact,modelName:string){
  const command=(template.dockerStartCmd||[]).join(' ')
  return template.imageName===VLLM_IMAGE&&(template.dockerEntrypoint||[]).join(' ').includes('bash')&&command.includes(BASE_MODEL_REVISION)&&command.includes(input.artifactRevision)&&command.includes(input.artifactId)&&command.includes(modelName)&&command.includes('--max-model-len')&&command.includes('8192')&&command.includes('--enforce-eager')&&command.includes('itmounts_mass_gateway.py')&&(template.ports||[]).includes(`${PUBLIC_PORT}/http`)
}

async function recoverTemplateId(template:Template|undefined,templateName:string):Promise<Template|undefined>{
  if(template?.id) return template
  // RunPod template creation can acknowledge before the template id is visible in the v1 index.
  // Re-read only the exact governed name for the same bounded propagation window used by endpoints;
  // never create a second template while provider identity is settling.
  for(let attempt=0;attempt<ENDPOINT_VISIBILITY_ATTEMPTS;attempt+=1){
    const templates=await requestV1<Template[]>('/templates?includeEndpointBoundTemplates=true')
    const exact=templates.find(item=>item.name===templateName&&item.isServerless!==false)
    if(exact?.id) return exact
    if(attempt<ENDPOINT_VISIBILITY_ATTEMPTS-1) await new Promise(resolve=>setTimeout(resolve,ENDPOINT_VISIBILITY_RETRY_MS))
  }
  return template
}

async function gpuPools():Promise<string[]>{
  const catalog=await requestV2<{gpus?:Gpu[]}>('/catalog/gpus')
  const pools=[...new Set((catalog.gpus||[]).filter(g=>clean(g.manufacturer).toUpperCase()==='NVIDIA'&&Number(g.memory||0)>=16&&Number(g.memory||0)<=24&&APPROVED_POOLS.includes(clean(g.pool) as any)&&Number(g.price?.serverless||Infinity)<=MAX_GPU_PRICE_USD&&clean(g.availability).toUpperCase()!=='NONE').map(g=>clean(g.pool)))]
  if(!APPROVED_POOLS.every(pool=>pools.includes(pool))) throw new Error('mass_distilled_runtime_gpu_capacity_unavailable')
  return [...APPROVED_POOLS]
}

function assertEndpointSafetyPolicy(endpoint:Endpoint,idleTimeoutSeconds=IDLE_TIMEOUT_SECONDS){
  if(endpoint.type!==ROUTING) throw new Error('mass_distilled_runtime_endpoint_routing_mismatch')
  if(Number(endpoint.workers?.min??Number.NaN)!==0||Number(endpoint.workers?.max??Number.NaN)>1||Number(endpoint.workers?.idleTimeout??Number.NaN)>idleTimeoutSeconds) throw new Error('mass_distilled_runtime_endpoint_worker_policy_drift')
  if(Number(endpoint.gpu?.count??Number.NaN)!==1) throw new Error('mass_distilled_runtime_endpoint_gpu_count_drift')
  const pools=(endpoint.gpu?.pools||[]).map(pool=>clean(pool,80))
  if(pools.length!==APPROVED_POOLS.length||!APPROVED_POOLS.every(pool=>pools.includes(pool))) throw new Error('mass_distilled_runtime_endpoint_gpu_pool_drift')
}

function assertEndpointPolicy(endpoint:Endpoint,templateId:string,idleTimeoutSeconds=IDLE_TIMEOUT_SECONDS){
  assertEndpointSafetyPolicy(endpoint,idleTimeoutSeconds)
  if(clean(endpoint.templateId,200)!==templateId) throw new Error('mass_distilled_runtime_endpoint_template_mismatch')
}

function runpodWorkerQuotaError(error:unknown){
  return (error instanceof Error?error.message:String(error))
    .toLowerCase().includes('max workers across all endpoints must not exceed your workers quota')
}

function configuredServerlessWorkerQuota(){
  const value=Number(process.env.RUNPOD_SERVERLESS_WORKER_QUOTA||'10')
  return Number.isFinite(value)&&value>=1?Math.floor(value):10
}

function reservedServerlessWorkerSlots(endpoints:Endpoint[]){
  return endpoints.reduce((total,endpoint)=>total+Math.max(0,Math.floor(Number(endpoint.workers?.max??0))),0)
}

async function releaseRetiredMassEndpointCapacity(endpoints:Endpoint[],activeEndpointName:string){
  const protectedEndpointIds=await protectedRunpodEndpointIds()
  const retired=endpoints.filter(endpoint=>endpoint.name.startsWith('itmounts-mass-distilled-')
    && endpoint.name!==activeEndpointName
    && !protectedEndpointIds.has(clean(endpoint.id,160).toLowerCase())
    && Number(endpoint.workers?.max??0)>0)
  for(const endpoint of retired){
    await requestV2<Endpoint>(`/serverless/${encodeURIComponent(endpoint.id)}`,{method:'PATCH',body:JSON.stringify({workers:{min:0,max:0,idleTimeout:Math.min(Number(endpoint.workers?.idleTimeout??IDLE_TIMEOUT_SECONDS),IDLE_TIMEOUT_SECONDS)}})})
  }
}

async function createMassEndpointViaGraphQl(input:{name:string;templateId:string;pools:string[];idleTimeoutSeconds:number}):Promise<Endpoint>{
  const data=await requestGraphQl<{saveEndpoint?:{id?:string;name?:string;type?:'QB'|'LB';templateId?:string;modelReferences?:string[]}}>(`
    mutation SaveMassDistilledEndpoint($input: EndpointInput!) {
      saveEndpoint(input: $input) {
        id
        name
        type
        templateId
        modelReferences
      }
    }
  `,{input:{
    name:input.name,
    type:'LB',
    templateId:input.templateId,
    gpuIds:input.pools.join(','),
    gpuCount:1,
    workersMin:0,
    workersMax:1,
    idleTimeout:input.idleTimeoutSeconds,
    scalerType:'REQUEST_COUNT',
    scalerValue:1,
    executionTimeoutMs:300000,
    flashBootType:'FLASHBOOT',
    // Match the proven distilled endpoint path: RunPod caches this immutable public base revision
    // outside the worker lifecycle, while the private exact LoRA remains downloaded by the worker.
    // This reduces cold-start download time without changing artifact identity or authority.
    modelReferences:[BASE_MODEL_REFERENCE],
  }})
  const created=data.saveEndpoint
  let observedId=clean(created?.id,120)
  if(created?.type&&created.type!=='LB') throw new Error('mass_distilled_runtime_endpoint_routing_mismatch')
  if(created?.templateId&&clean(created.templateId,200)!==input.templateId) throw new Error('mass_distilled_runtime_endpoint_template_mismatch')
  const modelReferences=Array.isArray(created?.modelReferences)?created.modelReferences.map(item=>clean(item,500)):[]
  if(modelReferences.length!==1||modelReferences[0]!==BASE_MODEL_REFERENCE) throw new Error('mass_distilled_runtime_base_cache_binding_mismatch')
  for(let attempt=0;attempt<ENDPOINT_VISIBILITY_ATTEMPTS;attempt+=1){
    const listed=await requestV2<{endpoints?:Endpoint[]}>('/serverless')
    const endpoint=(listed.endpoints||[]).find(item=>(observedId&&clean(item.id,120)===observedId)||clean(item.name,240)===input.name)
    if(endpoint?.id) return endpoint
    const official=await requestV1<RestEndpointIdentity[]>('/endpoints')
    const identity=official.find(item=>clean(item.name,240)===input.name&&clean(item.id,120))
    if(identity?.id) observedId=clean(identity.id,120)
    if(attempt<ENDPOINT_VISIBILITY_ATTEMPTS-1) await new Promise(resolve=>setTimeout(resolve,ENDPOINT_VISIBILITY_RETRY_MS))
  }
  if(!observedId) throw new Error('mass_distilled_runtime_endpoint_id_missing')
  throw new Error('mass_distilled_runtime_endpoint_policy_unavailable')
}

async function recoverEndpointId(endpoint:Endpoint|undefined,endpointName:string):Promise<Endpoint|undefined>{
  if(endpoint?.id) return endpoint
  // RunPod's create response and v1 endpoint index can lag the v2 control plane briefly.
  // Recover by the exact governed endpoint name, preferring v2, with the same bounded provider
  // propagation window used after create. Never issue a second create while identity is settling.
  for(let attempt=0;attempt<ENDPOINT_VISIBILITY_ATTEMPTS;attempt+=1){
    const listed=await requestV2<{endpoints?:Endpoint[]}>('/serverless')
    const v2=(listed.endpoints||[]).find(item=>clean(item.name,240)===endpointName&&clean(item.id,120))
    if(v2?.id) return v2
    const official=await requestV1<RestEndpointIdentity[]>('/endpoints')
    const v1=official.find(item=>clean(item.name,240)===endpointName&&clean(item.id,120))
    if(v1?.id) return {...(endpoint||{} as Endpoint),id:clean(v1.id,120),name:endpointName}
    if(attempt<ENDPOINT_VISIBILITY_ATTEMPTS-1) await new Promise(resolve=>setTimeout(resolve,ENDPOINT_VISIBILITY_RETRY_MS))
  }
  return endpoint
}

async function rebindEndpointTemplate(endpoint:Endpoint,templateId:string,idleTimeoutSeconds=IDLE_TIMEOUT_SECONDS):Promise<Endpoint>{
  assertEndpointSafetyPolicy(endpoint,idleTimeoutSeconds)
  if(clean(endpoint.templateId,200)===templateId) return endpoint
  await requestV1<unknown>(`/endpoints/${encodeURIComponent(endpoint.id)}`,{method:'PATCH',body:JSON.stringify({templateId})})
  const listed=await requestV2<{endpoints?:Endpoint[]}>('/serverless')
  const refreshed=(listed.endpoints||[]).find(item=>item.id===endpoint.id&&item.name===endpoint.name)
  if(!refreshed) throw new Error('mass_distilled_runtime_endpoint_template_rebind_missing')
  if(clean(refreshed.templateId,200)!==templateId) throw new Error('mass_distilled_runtime_endpoint_template_rebind_failed')
  assertEndpointPolicy(refreshed,templateId,idleTimeoutSeconds)
  return refreshed
}

export async function provisionMassDistilledRuntime(input:MassDistilledRuntimeArtifact){
  assertArtifact(input)
  const idleTimeoutSeconds=artifactIdleTimeoutSeconds(input)
  const token=process.env.HF_TOKEN?.trim()||''; if(token.length<20) throw new Error('HF_TOKEN is not configured')
  const ids=identity(input); const templates=await requestV1<Template[]>('/templates?includeEndpointBoundTemplates=true')
  let template=templates.find(item=>item.name===ids.templateName&&item.isServerless!==false); let createdTemplate=false
  if(template&&!templateMatches(template,input,ids.modelName)) throw new Error('mass_distilled_runtime_template_identity_mismatch')
  if(!template){template=await requestV1<Template>('/templates',{method:'POST',body:JSON.stringify({name:ids.templateName,imageName:VLLM_IMAGE,category:'NVIDIA',containerDiskInGb:50,dockerEntrypoint:['bash','-lc'],dockerStartCmd:[startupCommand(input,ids.modelName)],env:{HF_TOKEN:token,HF_HOME:'/models/hf-cache',PORT:String(PUBLIC_PORT),PORT_HEALTH:String(PUBLIC_PORT),HEALTH_CHECK_PATH:'/ping'},isPublic:false,isServerless:true,ports:[`${PUBLIC_PORT}/http`],readme:'iTMounts exact mass-distilled Qwen3-4B + immutable LoRA canary runtime. Strict internal-vLLM readiness; scale-to-zero; no Production traffic.'})});createdTemplate=true}
  template=await recoverTemplateId(template,ids.templateName)
  if(!template?.id){
    // Provider-shape diagnostic only: field names and exact-name visibility, never values/secrets.
    // Production has acknowledged template creates that remain id-less through the bounded v1 lookup.
    const observed=await requestV1<Template[]>('/templates?includeEndpointBoundTemplates=true')
    const exact=observed.find(item=>item.name===ids.templateName&&item.isServerless!==false)
    const createKeys=Object.keys(template||{}).sort().join(',')||'none'
    const exactKeys=Object.keys(exact||{}).sort().join(',')||'none'
    throw new Error(`mass_distilled_runtime_template_id_missing:create_keys=${createKeys};exact_visible=${Boolean(exact)};exact_keys=${exactKeys};list_count=${observed.length}`)
  }
  const listed=await requestV2<{endpoints?:Endpoint[]}>('/serverless'); let endpoint=(listed.endpoints||[]).find(item=>item.name===ids.endpointName); let createdEndpoint=false; let reboundTemplate=false
  if(!endpoint){
    // RunPod counts maxWorkers even for scale-to-zero endpoints. Exact-artifact canaries are
    // sequential, so older mass-distilled endpoints must release their reserved capacity without
    // deleting provider resources or touching unrelated workloads. The quota counter is eventually
    // consistent after PATCH max=0, so retry only this exact quota rejection with a fresh protected
    // endpoint snapshot and a bounded settle delay.
    const pools=await gpuPools()
    let quotaError:unknown=null
    for(let attempt=0;attempt<4&&!endpoint;attempt+=1){
      const current=attempt===0?listed:await requestV2<{endpoints?:Endpoint[]}>('/serverless')
      await releaseRetiredMassEndpointCapacity(current.endpoints||[],ids.endpointName)
      const refreshed=await requestV2<{endpoints?:Endpoint[]}>('/serverless')
      endpoint=(refreshed.endpoints||[]).find(item=>item.name===ids.endpointName)
      if(endpoint) break
      const reserved=reservedServerlessWorkerSlots(refreshed.endpoints||[])
      const quota=configuredServerlessWorkerQuota()
      if(reserved>=quota){
        quotaError=new Error(`mass_distilled_runtime_worker_quota_full:${reserved}/${quota}`)
        if(attempt<3) await new Promise(resolve=>setTimeout(resolve,1000*(attempt+1)))
        continue
      }
      if(attempt>0) await new Promise(resolve=>setTimeout(resolve,1000*attempt))
      try{
        endpoint=await createMassEndpointViaGraphQl({name:ids.endpointName,templateId:template.id,pools,idleTimeoutSeconds})
        createdEndpoint=true
      }catch(error){
        if(!runpodWorkerQuotaError(error)) throw error
        quotaError=new Error('mass_distilled_runtime_worker_quota_full')
      }
    }
    if(!endpoint&&quotaError) throw quotaError
  }
  else {const previousTemplateId=clean(endpoint.templateId,200); endpoint=await rebindEndpointTemplate(endpoint,template.id,idleTimeoutSeconds); reboundTemplate=previousTemplateId!==template.id}
  endpoint=await recoverEndpointId(endpoint,ids.endpointName)
  if(!endpoint?.id) throw new Error('mass_distilled_runtime_endpoint_id_missing')
  assertEndpointPolicy(endpoint,template.id,idleTimeoutSeconds)
  return Object.freeze({...ids,endpointId:endpoint.id,createdTemplate,createdEndpoint,reboundTemplate,workersMin:Number(endpoint.workers?.min),workersMax:Number(endpoint.workers?.max),idleTimeout:Number(endpoint.workers?.idleTimeout),baseUrl:`https://${endpoint.id}.api.runpod.ai/v1`})
}

export async function massDistilledRuntimeHealth(endpointId:string){
  const key=configuredRunpodApiKey(); if(!key) throw new Error('RUNPOD_API_KEY is not configured')
  const response=await fetch(`${SERVERLESS_API}/${endpointId}/health`,{headers:{Authorization:`Bearer ${key}`},signal:AbortSignal.timeout(HEALTH_TIMEOUT_MS)})
  const raw=await response.text(); let payload:any={}; try{payload=JSON.parse(raw)}catch{}
  return Object.freeze({ok:response.ok,httpStatus:response.status,jobs:{inProgress:Number(payload?.jobs?.inProgress||0),inQueue:Number(payload?.jobs?.inQueue||0),failed:Number(payload?.jobs?.failed||0),completed:Number(payload?.jobs?.completed||0)},workers:{idle:Number(payload?.workers?.idle||0),ready:Number(payload?.workers?.ready||0),running:Number(payload?.workers?.running||0),initializing:Number(payload?.workers?.initializing||0)},error:response.ok?null:(safeError(raw)||`HTTP ${response.status}`)})
}

export async function canaryMassDistilledRuntime(input:{endpointId:string;modelName:string}){
  const key=configuredRunpodApiKey(); if(!key) throw new Error('RUNPOD_API_KEY is not configured')
  const root=`https://${input.endpointId}.api.runpod.ai`
  const deadline=Date.now()+READY_TIMEOUT_MS
  let lastStatus:number|null=null
  let lastError:string|null=null
  let readyObserved=false

  // A single direct LB request wakes scale-to-zero compute. RunPod does not route custom paths until
  // the worker's configured /ping health check returns 200, so do not hold a /ready request open for
  // the provider's ~2 minute "no worker available" gateway timeout. The gateway itself returns 204
  // from /ping while vLLM is booting, which keeps the worker initializing rather than prematurely routable.
  try{
    const wake=await fetch(`${root}/ping`,{
      headers:{Authorization:`Bearer ${key}`},
      signal:AbortSignal.timeout(Math.min(20_000,Math.max(1000,deadline-Date.now()))),
    })
    lastStatus=wake.status
    if(wake.status===401||wake.status===403) return {ok:false,httpStatus:wake.status,text:null,error:`mass_distilled_runtime_wake_http_${wake.status}`}
    if(wake.status===200) readyObserved=true
  }catch{
    // The wake request is expected to miss/timeout while a scale-to-zero LB has no healthy worker.
    // Readiness is authoritatively observed below through RunPod's endpoint health control plane.
  }

  while(!readyObserved&&Date.now()<deadline){
    try{
      const health=await massDistilledRuntimeHealth(input.endpointId)
      lastStatus=health.httpStatus
      if(!health.ok&&health.error) lastError=health.error
      if(health.workers.ready>0){readyObserved=true;break}
    }catch(error){
      lastError=error instanceof Error?clean(error.message):'mass_distilled_health_probe_failed'
    }
    if(Date.now()<deadline) await new Promise(resolve=>setTimeout(resolve,Math.min(3000,Math.max(0,deadline-Date.now()))))
  }
  if(!readyObserved) return {ok:false,httpStatus:lastStatus,text:null,error:lastError||'mass_distilled_runtime_worker_not_ready'}

  try{
    const response=await fetch(`${root}/v1/chat/completions`,{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({model:input.modelName,max_tokens:64,temperature:0,chat_template_kwargs:{enable_thinking:false},messages:[{role:'system',content:'Return one concise sentence. Do not reveal hidden reasoning.'},{role:'user',content:'State the operational principle: evidence should be separated from inference.'}]}),signal:AbortSignal.timeout(CANARY_TIMEOUT_MS)})
    const raw=await response.text(); if(!response.ok) return {ok:false,httpStatus:response.status,text:null,error:safeError(raw)||`HTTP ${response.status}`}
    let payload:any={}; try{payload=JSON.parse(raw)}catch{}
    const text=clean(payload?.choices?.[0]?.message?.content,2000)
    return text?{ok:true,httpStatus:response.status,text,error:null}:{ok:false,httpStatus:response.status,text:null,error:'mass_distilled_canary_empty'}
  }catch(error){return {ok:false,httpStatus:null,text:null,error:error instanceof Error?clean(error.message):'mass_distilled_canary_failed'}}
}

export const MASS_DISTILLED_CANARY_MAX_COST_USD=0.2
export const MASS_DISTILLED_MAX_CANARY_INVOCATIONS=1
export const MASS_DISTILLED_READY_TIMEOUT_MS=READY_TIMEOUT_MS
export const MASS_DISTILLED_CANARY_TIMEOUT_MS=CANARY_TIMEOUT_MS
export const MASS_DISTILLED_IDLE_TIMEOUT_SECONDS=IDLE_TIMEOUT_SECONDS
export const MASS_DISTILLED_REQUEST_TIMEOUT_MS=REQUEST_TIMEOUT_MS
export const MASS_DISTILLED_HEALTH_TIMEOUT_MS=HEALTH_TIMEOUT_MS
