// Dynamic exact-artifact RunPod canary support for mass-distilled students.
import { configuredRunpodApiKey } from './runpodConfig.ts'

const REST_V1 = 'https://rest.runpod.io/v1'
const CONTROL_API_V2 = 'https://api.runpod.io/v2'
const SERVERLESS_API = 'https://api.runpod.ai/v2'
const VLLM_IMAGE = 'vllm/vllm-openai:v0.29.0'
const BASE_MODEL_ID = 'Qwen/Qwen3-4B'
const BASE_MODEL_REVISION = '1cfa9a7208912126459214e8b04321603b3df60c'
const ROUTING = 'LOAD_BALANCER' as const
const PUBLIC_PORT = 8000
const IDLE_TIMEOUT_SECONDS = 60
// Production evidence showed the exact Qwen3-4B + LoRA worker still loading at 190 seconds while
// RunPod reported one healthy running worker. Keep enough of the 300-second route budget for the
// inference probe and evidence writes, but do not turn a slow cold start into a false terminal
// artifact failure.
const READY_TIMEOUT_MS = 235_000
const CANARY_TIMEOUT_MS = 35_000
const MAX_GPU_PRICE_USD = 0.69
const REQUEST_TIMEOUT_MS = 8_000
const HEALTH_TIMEOUT_MS = 5_000
const APPROVED_POOLS = ['AMPERE_16', 'AMPERE_24'] as const

export type MassDistilledRuntimeArtifact = Readonly<{
  candidateId: string
  subjectId: string
  artifactId: string
  artifactRevision: string
  artifactHash: string
  /** Host-derived approval-scoped key. It isolates a fresh provider runtime after a preflight failure. */
  runtimeKey?: string
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

function assertArtifact(input:MassDistilledRuntimeArtifact){
  if(!input.candidateId.startsWith('mass:')||!input.artifactId||!HEX40.test(input.artifactRevision)||!HEX64.test(input.artifactHash)) throw new Error('mass_distilled_runtime_artifact_invalid')
}

function identity(input:MassDistilledRuntimeArtifact){
  const suffix=input.artifactHash.slice(0,12).toLowerCase()
  const runtimeKey=clean(input.runtimeKey,32).toLowerCase().replace(/[^a-z0-9]/g,'').slice(0,10)
  if(runtimeKey){
    return {templateName:`itmounts-mass-distilled-${suffix}-${runtimeKey}-v3`,endpointName:`itmounts-mass-distilled-${suffix}-${runtimeKey}-v3`,modelName:`itmounts-mass-distilled-${suffix}-${runtimeKey}`}
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
async def ping(): return {'status':'accepting_requests','modelReady':ready.is_set()}
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
    async with httpx.AsyncClient(timeout=60.0) as client: r=await client.request(req.method,f'http://127.0.0.1:{INTERNAL}{path}',content=body,headers={'content-type':'application/json'})
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

async function gpuPools():Promise<string[]>{
  const catalog=await requestV2<{gpus?:Gpu[]}>('/catalog/gpus')
  const pools=[...new Set((catalog.gpus||[]).filter(g=>clean(g.manufacturer).toUpperCase()==='NVIDIA'&&Number(g.memory||0)>=16&&Number(g.memory||0)<=24&&APPROVED_POOLS.includes(clean(g.pool) as any)&&Number(g.price?.serverless||Infinity)<=MAX_GPU_PRICE_USD&&clean(g.availability).toUpperCase()!=='NONE').map(g=>clean(g.pool)))]
  if(!APPROVED_POOLS.every(pool=>pools.includes(pool))) throw new Error('mass_distilled_runtime_gpu_capacity_unavailable')
  return [...APPROVED_POOLS]
}

function assertEndpointSafetyPolicy(endpoint:Endpoint){
  if(endpoint.type!==ROUTING) throw new Error('mass_distilled_runtime_endpoint_routing_mismatch')
  if(Number(endpoint.workers?.min??Number.NaN)!==0||Number(endpoint.workers?.max??Number.NaN)>1||Number(endpoint.workers?.idleTimeout??Number.NaN)>IDLE_TIMEOUT_SECONDS) throw new Error('mass_distilled_runtime_endpoint_worker_policy_drift')
  if(Number(endpoint.gpu?.count??Number.NaN)!==1) throw new Error('mass_distilled_runtime_endpoint_gpu_count_drift')
  const pools=(endpoint.gpu?.pools||[]).map(pool=>clean(pool,80))
  if(pools.length!==APPROVED_POOLS.length||!APPROVED_POOLS.every(pool=>pools.includes(pool))) throw new Error('mass_distilled_runtime_endpoint_gpu_pool_drift')
}

function assertEndpointPolicy(endpoint:Endpoint,templateId:string){
  assertEndpointSafetyPolicy(endpoint)
  if(clean(endpoint.templateId,200)!==templateId) throw new Error('mass_distilled_runtime_endpoint_template_mismatch')
}

async function releaseRetiredMassEndpointCapacity(endpoints:Endpoint[],activeEndpointName:string){
  const retired=endpoints.filter(endpoint=>endpoint.name.startsWith('itmounts-mass-distilled-')&&endpoint.name!==activeEndpointName&&Number(endpoint.workers?.max??0)>0)
  for(const endpoint of retired){
    await requestV2<Endpoint>(`/serverless/${encodeURIComponent(endpoint.id)}`,{method:'PATCH',body:JSON.stringify({workers:{min:0,max:0,idleTimeout:Math.min(Number(endpoint.workers?.idleTimeout??IDLE_TIMEOUT_SECONDS),IDLE_TIMEOUT_SECONDS)}})})
  }
}

async function recoverEndpointId(endpoint:Endpoint|undefined,endpointName:string):Promise<Endpoint|undefined>{
  if(endpoint?.id) return endpoint
  const official=await requestV1<RestEndpointIdentity[]>('/endpoints')
  const match=official.find(item=>clean(item.name,240)===endpointName&&clean(item.id,120))
  return match?.id?{...(endpoint||{} as Endpoint),id:clean(match.id,120),name:endpointName}:endpoint
}

async function rebindEndpointTemplate(endpoint:Endpoint,templateId:string):Promise<Endpoint>{
  assertEndpointSafetyPolicy(endpoint)
  if(clean(endpoint.templateId,200)===templateId) return endpoint
  await requestV1<unknown>(`/endpoints/${encodeURIComponent(endpoint.id)}`,{method:'PATCH',body:JSON.stringify({templateId})})
  const listed=await requestV2<{endpoints?:Endpoint[]}>('/serverless')
  const refreshed=(listed.endpoints||[]).find(item=>item.id===endpoint.id&&item.name===endpoint.name)
  if(!refreshed) throw new Error('mass_distilled_runtime_endpoint_template_rebind_missing')
  if(clean(refreshed.templateId,200)!==templateId) throw new Error('mass_distilled_runtime_endpoint_template_rebind_failed')
  assertEndpointPolicy(refreshed,templateId)
  return refreshed
}

export async function provisionMassDistilledRuntime(input:MassDistilledRuntimeArtifact){
  assertArtifact(input)
  const token=process.env.HF_TOKEN?.trim()||''; if(token.length<20) throw new Error('HF_TOKEN is not configured')
  const ids=identity(input); const templates=await requestV1<Template[]>('/templates')
  let template=templates.find(item=>item.name===ids.templateName&&item.isServerless!==false); let createdTemplate=false
  if(template&&!templateMatches(template,input,ids.modelName)) throw new Error('mass_distilled_runtime_template_identity_mismatch')
  if(!template){template=await requestV1<Template>('/templates',{method:'POST',body:JSON.stringify({name:ids.templateName,imageName:VLLM_IMAGE,category:'NVIDIA',containerDiskInGb:50,dockerEntrypoint:['bash','-lc'],dockerStartCmd:[startupCommand(input,ids.modelName)],env:{HF_TOKEN:token,HF_HOME:'/models/hf-cache',PORT:String(PUBLIC_PORT),PORT_HEALTH:String(PUBLIC_PORT),HEALTH_CHECK_PATH:'/ping'},isPublic:false,isServerless:true,ports:[`${PUBLIC_PORT}/http`],readme:'iTMounts exact mass-distilled Qwen3-4B + immutable LoRA canary runtime. Strict internal-vLLM readiness; scale-to-zero; no Production traffic.'})});createdTemplate=true}
  if(!template?.id) throw new Error('mass_distilled_runtime_template_id_missing')
  const listed=await requestV2<{endpoints?:Endpoint[]}>('/serverless'); let endpoint=(listed.endpoints||[]).find(item=>item.name===ids.endpointName); let createdEndpoint=false; let reboundTemplate=false
  if(!endpoint){
    // RunPod counts maxWorkers even for scale-to-zero endpoints. Exact-artifact canaries are
    // sequential, so older mass-distilled endpoints must release their reserved capacity without
    // deleting provider resources or touching unrelated workloads.
    await releaseRetiredMassEndpointCapacity(listed.endpoints||[],ids.endpointName)
    endpoint=await requestV2<Endpoint>('/serverless',{method:'POST',body:JSON.stringify({name:ids.endpointName,type:ROUTING,templateId:template.id,gpu:{pools:await gpuPools(),count:1},workers:{min:0,max:1,idleTimeout:IDLE_TIMEOUT_SECONDS},scaling:{type:'REQUEST_COUNT',requestCount:1},timeout:300000,flashboot:'FLASHBOOT'})});createdEndpoint=true
  }
  else {const previousTemplateId=clean(endpoint.templateId,200); endpoint=await rebindEndpointTemplate(endpoint,template.id); reboundTemplate=previousTemplateId!==template.id}
  endpoint=await recoverEndpointId(endpoint,ids.endpointName)
  if(!endpoint?.id) throw new Error('mass_distilled_runtime_endpoint_id_missing')
  assertEndpointPolicy(endpoint,template.id)
  return Object.freeze({...ids,endpointId:endpoint.id,createdTemplate,createdEndpoint,reboundTemplate,workersMin:Number(endpoint.workers?.min),workersMax:Number(endpoint.workers?.max),idleTimeout:Number(endpoint.workers?.idleTimeout),baseUrl:`https://${endpoint.id}.api.runpod.ai/v1`})
}

export async function massDistilledRuntimeHealth(endpointId:string){
  const key=configuredRunpodApiKey(); if(!key) throw new Error('RUNPOD_API_KEY is not configured')
  const response=await fetch(`${SERVERLESS_API}/${endpointId}/health`,{headers:{Authorization:`Bearer ${key}`},signal:AbortSignal.timeout(HEALTH_TIMEOUT_MS)})
  const raw=await response.text(); let payload:any={}; try{payload=JSON.parse(raw)}catch{}
  return Object.freeze({ok:response.ok,httpStatus:response.status,jobs:{inProgress:Number(payload?.jobs?.inProgress||0),inQueue:Number(payload?.jobs?.inQueue||0),failed:Number(payload?.jobs?.failed||0),completed:Number(payload?.jobs?.completed||0)},workers:{idle:Number(payload?.workers?.idle||0),running:Number(payload?.workers?.running||0)},error:response.ok?null:(safeError(raw)||`HTTP ${response.status}`)})
}

export async function canaryMassDistilledRuntime(input:{endpointId:string;modelName:string}){
  const key=configuredRunpodApiKey(); if(!key) throw new Error('RUNPOD_API_KEY is not configured')
  const root=`https://${input.endpointId}.api.runpod.ai`; const deadline=Date.now()+READY_TIMEOUT_MS; let lastStatus:number|null=null; let lastError:string|null=null
  while(Date.now()<deadline){
    try{
      const response=await fetch(`${root}/ready`,{headers:{Authorization:`Bearer ${key}`},signal:AbortSignal.timeout(Math.min(120000,Math.max(1000,deadline-Date.now())))})
      lastStatus=response.status; const raw=await response.text()
      if(response.status===200){let payload:any={};try{payload=raw?JSON.parse(raw):{}}catch{};if(payload?.ready===true) break}
      const detail=safeError(raw); if(detail) lastError=detail
      if(response.status===503&&detail?.includes('distilled_bootstrap_failed')) return {ok:false,httpStatus:response.status,text:null,error:detail}
    }catch(error){lastError=error instanceof Error?clean(error.message):'mass_distilled_ready_failed'}
    if(Date.now()<deadline) await new Promise(resolve=>setTimeout(resolve,Math.min(3000,Math.max(0,deadline-Date.now()))))
  }
  if(lastStatus!==200) return {ok:false,httpStatus:lastStatus,text:null,error:lastError||'mass_distilled_internal_vllm_not_ready'}
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
