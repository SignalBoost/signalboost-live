import { configuredRunpodApiKey } from './runpodConfig.ts'

const REST_V1 = 'https://rest.runpod.io/v1'
const CONTROL_API_V2 = 'https://api.runpod.io/v2'
const SERVERLESS_API = 'https://api.runpod.ai/v2'
const VLLM_IMAGE = 'vllm/vllm-openai:v0.29.0'
export const DISTILLED_V6_TEMPLATE_NAME = 'itmounts-distilled-llm-serverless-lb-v4'
export const DISTILLED_V6_ENDPOINT_NAME = 'itmounts-distilled-reasoning-lb-v6'
export const DISTILLED_V6_MODEL_NAME = 'itmounts-distilled-reasoning-v1'
export const DISTILLED_V6_BASE_MODEL_ID = 'Qwen/Qwen3-4B'
export const DISTILLED_V6_BASE_MODEL_REVISION = '1cfa9a7208912126459214e8b04321603b3df60c'
export const DISTILLED_V6_ADAPTER_MODEL_ID = 'cadomos/itmounts-student-f993a365a01e'
export const DISTILLED_V6_ADAPTER_MODEL_REVISION = '9f03387d87de550b96d973f9f30a3f02e783997e'
export const DISTILLED_V6_IDLE_TIMEOUT_SECONDS = 60
export const DISTILLED_V6_READY_TIMEOUT_MS = 220_000
export const DISTILLED_V6_CANARY_TIMEOUT_MS = 60_000
export const DISTILLED_V6_MAX_COST_USD = 0.2
const PUBLIC_PORT = 8000
const INTERNAL_PORT = 8001
const MAX_GPU_PRICE_USD = 0.69
const APPROVED_POOLS = ['AMPERE_16', 'AMPERE_24'] as const

type Template = { id:string; name:string; imageName?:string; isServerless?:boolean; dockerEntrypoint?:string[]; dockerStartCmd?:string[]; ports?:string[] }
type Endpoint = { id:string; name:string; type?:'QUEUE'|'LOAD_BALANCER'; workers?:{min?:number;max?:number;idleTimeout?:number}; gpu?:{pools?:string[];count?:number} }
type Gpu = { pool?:string; manufacturer?:string; memory?:number; availability?:string; price?:{serverless?:number|null} }

const clean = (v:unknown,max=300)=>String(v??'').replace(/\s+/g,' ').trim().slice(0,max)
function safeError(raw:string){try{const v:any=JSON.parse(raw);const d=[v?.message,v?.detail,typeof v?.error==='string'?v.error:null,v?.error?.message].map(clean).find(Boolean)||'';return d?d.replace(/\b(bearer|token|secret|api[_-]?key)\b\s*[:=]?\s*[^,;\s]+/gi,'$1=[redacted]').slice(0,300):null}catch{return null}}
async function requestV1<T>(path:string,init:RequestInit={}):Promise<T>{const key=configuredRunpodApiKey();if(!key)throw new Error('RUNPOD_API_KEY is not configured');const r=await fetch(`${REST_V1}${path}`,{...init,headers:{Authorization:`Bearer ${key}`,...(init.body?{'Content-Type':'application/json'}:{}),...(init.headers||{})},signal:AbortSignal.timeout(15000)});const raw=await r.text();if(!r.ok)throw new Error(`RunPod REST v1 HTTP ${r.status}${safeError(raw)?`: ${safeError(raw)}`:''}`);return raw?JSON.parse(raw) as T:{} as T}
async function requestV2<T>(path:string,init:RequestInit={}):Promise<T>{const key=configuredRunpodApiKey();if(!key)throw new Error('RUNPOD_API_KEY is not configured');const r=await fetch(`${CONTROL_API_V2}${path}`,{...init,headers:{Authorization:`Bearer ${key}`,...(init.body?{'Content-Type':'application/json'}:{}),...(init.headers||{})},signal:AbortSignal.timeout(15000)});const raw=await r.text();if(!r.ok)throw new Error(`RunPod REST v2 HTTP ${r.status}${safeError(raw)?`: ${safeError(raw)}`:''}`);return raw?JSON.parse(raw) as T:{} as T}

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
    async with httpx.AsyncClient(timeout=120.0) as client: r=await client.request(req.method,f'http://127.0.0.1:{INTERNAL}{path}',content=body,headers={'content-type':req.headers.get('content-type','application/json')})
    return Response(content=r.content,status_code=r.status_code,media_type=r.headers.get('content-type','application/json'))
@app.post('/v1/chat/completions')
async def chat(req:Request): return await proxy(req,'/v1/chat/completions')
if __name__=='__main__': uvicorn.run(app,host='0.0.0.0',port=8000)`}
function startupCommand(){const g=Buffer.from(gatewaySource(),'utf8').toString('base64');return ['set -euo pipefail','mkdir -p /models/base /models/adapter /models/hf-cache',`export ITMOUNTS_BASE_MODEL_ID='${DISTILLED_V6_BASE_MODEL_ID}'`,`export ITMOUNTS_BASE_MODEL_REVISION='${DISTILLED_V6_BASE_MODEL_REVISION}'`,`export ITMOUNTS_ADAPTER_MODEL_ID='${DISTILLED_V6_ADAPTER_MODEL_ID}'`,`export ITMOUNTS_ADAPTER_MODEL_REVISION='${DISTILLED_V6_ADAPTER_MODEL_REVISION}'`,`export ITMOUNTS_DISTILLED_MODEL_NAME='${DISTILLED_V6_MODEL_NAME}'`,`python3 -c "import base64;open('/tmp/itmounts_v6_gateway.py','wb').write(base64.b64decode('${g}'))"`,'exec python3 /tmp/itmounts_v6_gateway.py'].join('; ')}
function templateMatches(t:Template){const c=(t.dockerStartCmd||[]).join(' ');return t.imageName===VLLM_IMAGE&&(t.dockerEntrypoint||[]).join(' ').includes('bash')&&c.includes(DISTILLED_V6_BASE_MODEL_REVISION)&&c.includes(DISTILLED_V6_ADAPTER_MODEL_REVISION)&&c.includes('--max-model-len')&&c.includes('8192')&&c.includes('--enforce-eager')&&c.includes('itmounts_v6_gateway.py')&&(t.ports||[]).includes('8000/http')}
async function pools(){const c=await requestV2<{gpus?:Gpu[]}>('/catalog/gpus');const p=[...new Set((c.gpus||[]).filter(g=>clean(g.manufacturer).toUpperCase()==='NVIDIA'&&Number(g.memory||0)>=16&&Number(g.memory||0)<=24&&APPROVED_POOLS.includes(clean(g.pool) as any)&&Number(g.price?.serverless||Infinity)<=MAX_GPU_PRICE_USD&&clean(g.availability).toUpperCase()!=='NONE').map(g=>clean(g.pool)))];if(!APPROVED_POOLS.every(x=>p.includes(x)))throw new Error('distilled_v6_gpu_capacity_unavailable');return [...APPROVED_POOLS]}
export async function provisionDistilledV6(){const token=process.env.HF_TOKEN?.trim()||'';if(token.length<20)throw new Error('HF_TOKEN is not configured');const templates=await requestV1<Template[]>('/templates');let t=templates.find(x=>x.name===DISTILLED_V6_TEMPLATE_NAME&&x.isServerless!==false);let createdTemplate=false;if(t&&!templateMatches(t))throw new Error('distilled_v6_template_identity_mismatch');if(!t){t=await requestV1<Template>('/templates',{method:'POST',body:JSON.stringify({name:DISTILLED_V6_TEMPLATE_NAME,imageName:VLLM_IMAGE,category:'NVIDIA',containerDiskInGb:50,dockerEntrypoint:['bash','-lc'],dockerStartCmd:[startupCommand()],env:{HF_TOKEN:token,HF_HOME:'/models/hf-cache',PORT:'8000',PORT_HEALTH:'8000',HEALTH_CHECK_PATH:'/ping'},isPublic:false,isServerless:true,ports:['8000/http'],readme:'iTMounts distilled v6 exact artifact; strict internal-vLLM readiness; scale-to-zero.'})});createdTemplate=true}if(!t?.id)throw new Error('distilled_v6_template_id_missing');const listed=await requestV2<{endpoints?:Endpoint[]}>('/serverless');let e=(listed.endpoints||[]).find(x=>x.name===DISTILLED_V6_ENDPOINT_NAME);let createdEndpoint=false;if(!e){e=await requestV2<Endpoint>('/serverless',{method:'POST',body:JSON.stringify({name:DISTILLED_V6_ENDPOINT_NAME,type:'LOAD_BALANCER',templateId:t.id,gpu:{pools:await pools(),count:1},workers:{min:0,max:1,idleTimeout:DISTILLED_V6_IDLE_TIMEOUT_SECONDS},scaling:{type:'REQUEST_COUNT',requestCount:1},timeout:300000,flashboot:'FLASHBOOT'})});createdEndpoint=true}if(!e?.id)throw new Error('distilled_v6_endpoint_id_missing');if(Number(e.workers?.min??0)!==0||Number(e.workers?.max??1)>1||Number(e.workers?.idleTimeout??60)>60||(e.gpu?.count!==undefined&&Number(e.gpu.count)!==1))throw new Error('distilled_v6_endpoint_policy_drift');return {endpointId:e.id,createdTemplate,createdEndpoint,baseUrl:`https://${e.id}.api.runpod.ai/v1`}}
export async function distilledV6Health(endpointId:string){const key=configuredRunpodApiKey();if(!key)throw new Error('RUNPOD_API_KEY is not configured');const r=await fetch(`${SERVERLESS_API}/${endpointId}/health`,{headers:{Authorization:`Bearer ${key}`},signal:AbortSignal.timeout(10000)});const raw=await r.text();let p:any={};try{p=JSON.parse(raw)}catch{};return {ok:r.ok,httpStatus:r.status,jobs:{inProgress:Number(p?.jobs?.inProgress||0),inQueue:Number(p?.jobs?.inQueue||0),failed:Number(p?.jobs?.failed||0),completed:Number(p?.jobs?.completed||0)},workers:{idle:Number(p?.workers?.idle||0),running:Number(p?.workers?.running||0)},error:r.ok?null:(safeError(raw)||`HTTP ${r.status}`)}}
export async function canaryDistilledV6(endpointId:string){const key=configuredRunpodApiKey();if(!key)throw new Error('RUNPOD_API_KEY is not configured');const root=`https://${endpointId}.api.runpod.ai`;const deadline=Date.now()+DISTILLED_V6_READY_TIMEOUT_MS;let lastStatus:number|null=null;let lastError:string|null=null;while(Date.now()<deadline){try{const r=await fetch(`${root}/ready`,{headers:{Authorization:`Bearer ${key}`},signal:AbortSignal.timeout(Math.min(125000,Math.max(1000,deadline-Date.now())))});lastStatus=r.status;const raw=await r.text();if(r.status===200){const payload:any=raw?JSON.parse(raw):{};if(payload?.ready===true)break}const d=safeError(raw);if(d)lastError=d;if(r.status===503&&d?.includes('distilled_bootstrap_failed'))return {ok:false,httpStatus:r.status,text:null,error:d}}catch(e){lastError=e instanceof Error?clean(e.message):'distilled_v6_ready_probe_failed'}await new Promise(res=>setTimeout(res,3000))}if(lastStatus!==200)return {ok:false,httpStatus:lastStatus,text:null,error:lastError||'distilled_v6_internal_vllm_not_ready'};try{const r=await fetch(`${root}/v1/chat/completions`,{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({model:DISTILLED_V6_MODEL_NAME,max_tokens:64,temperature:0,messages:[{role:'system',content:'Return one concise sentence. Do not reveal hidden reasoning.'},{role:'user',content:'State the operational principle: evidence should be separated from inference.'}]}),signal:AbortSignal.timeout(DISTILLED_V6_CANARY_TIMEOUT_MS)});const raw=await r.text();if(!r.ok)return {ok:false,httpStatus:r.status,text:null,error:safeError(raw)||`HTTP ${r.status}`};let p:any={};try{p=JSON.parse(raw)}catch{};const text=clean(p?.choices?.[0]?.message?.content,2000);return text?{ok:true,httpStatus:r.status,text,error:null}:{ok:false,httpStatus:r.status,text:null,error:'distilled_v6_empty_response'}}catch(e){return {ok:false,httpStatus:null,text:null,error:e instanceof Error?clean(e.message):'distilled_v6_canary_failed'}}}
