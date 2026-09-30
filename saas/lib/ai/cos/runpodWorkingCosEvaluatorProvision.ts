import { configuredRunpodApiKey } from './runpodConfig.ts'
import { workingCosEvaluatorRuntimeBinding } from './cosWorkingDistillationEvaluatorRuntime.ts'
import { workingCosEvaluatorInlineContainer } from './runpodWorkingCosEvaluatorRuntime.ts'

const REST='https://rest.runpod.io/v1', CONTROL='https://api.runpod.io/v2', SERVERLESS='https://api.runpod.ai/v2'
const MAX_HOURLY_USD=Number(process.env.COS_WORKING_DISTILLATION_MAX_HOURLY_COST_USD||'2.5')
const IDLE=60, READY_MS=420_000, REQUEST_MS=120_000
type Template={id:string;name:string;isServerless?:boolean}
type Endpoint={id:string;name:string;type?:string;workers?:{min?:number;max?:number;idleTimeout?:number};gpu?:{pools?:string[];count?:number}}
type Gpu={pool?:string;manufacturer?:string;memory?:number;availability?:string;price?:{serverless?:number|null}}
const clean=(v:unknown,n=300)=>String(v??'').replace(/\s+/g,' ').trim().slice(0,n)
async function req<T>(base:string,path:string,init:RequestInit={}):Promise<T>{const key=configuredRunpodApiKey();if(!key)throw new Error('RUNPOD_API_KEY is not configured');const r=await fetch(base+path,{...init,headers:{Authorization:`Bearer ${key}`,...(init.body?{'Content-Type':'application/json'}:{}),...(init.headers||{})},signal:AbortSignal.timeout(15000)});const raw=await r.text();if(!r.ok)throw new Error(`RunPod control HTTP ${r.status}:${clean(raw,240)}`);return raw?JSON.parse(raw) as T:{} as T}

async function approvedPools(){
  const c=await req<{gpus?:Gpu[]}>(CONTROL,'/catalog/gpus')
  const pools=[...new Set((c.gpus||[]).filter(g=>clean(g.manufacturer).toUpperCase()==='NVIDIA'&&Number(g.memory||0)>=48&&Number(g.memory||0)<=80&&Number(g.price?.serverless||Infinity)<=MAX_HOURLY_USD&&clean(g.availability).toUpperCase()!=='NONE').map(g=>clean(g.pool,80)).filter(Boolean))]
  if(!pools.length)throw new Error('working_cos_evaluator_gpu_capacity_unavailable')
  return pools
}

export async function provisionWorkingCosEvaluator(input:{candidateId:string;artifactHash:string;db?:any}){
  const binding=await workingCosEvaluatorRuntimeBinding(input)
  const suffix=binding.admission.artifactHash.slice(0,12)
  const modelName=`itmounts-working-cos-${suffix}`,templateName=`${modelName}-evaluator-template-v1`,endpointName=`${modelName}-evaluator-v1`
  const container=workingCosEvaluatorInlineContainer(binding,modelName)
  const token=process.env.HF_TOKEN?.trim()||'';if(token.length<20)throw new Error('HF_TOKEN is not configured')
  let templates=await req<Template[]>(REST,'/templates?includeEndpointBoundTemplates=true')
  let t=templates.find(x=>x.name===templateName&&x.isServerless!==false),createdTemplate=false
  if(!t){t=await req<Template>(REST,'/templates',{method:'POST',body:JSON.stringify({name:templateName,imageName:container.image,category:'NVIDIA',containerDiskInGb:80,dockerEntrypoint:['bash','-lc'],dockerStartCmd:[JSON.parse(container.args).cmd[0]],env:container.env,isPublic:false,isServerless:true,ports:container.ports,readme:'iTMounts Working-COS exact Qwen3-30B + PEFT independent evaluator; scale-to-zero; no Production traffic.'})});createdTemplate=true}
  if(!t?.id)throw new Error('working_cos_evaluator_template_id_missing')
  const listed=await req<{endpoints?:Endpoint[]}>(CONTROL,'/serverless');let e=(listed.endpoints||[]).find(x=>x.name===endpointName),createdEndpoint=false
  if(!e){e=await req<Endpoint>(CONTROL,'/serverless',{method:'POST',body:JSON.stringify({name:endpointName,type:'LOAD_BALANCER',templateId:t.id,gpu:{pools:await approvedPools(),count:1},workers:{min:0,max:1,idleTimeout:IDLE},scaling:{type:'REQUEST_COUNT',requestCount:1},timeout:300000,flashboot:'FLASHBOOT'})});createdEndpoint=true}
  if(!e?.id)throw new Error('working_cos_evaluator_endpoint_id_missing')
  if(Number(e.workers?.min??0)!==0||Number(e.workers?.max??1)>1||Number(e.workers?.idleTimeout??IDLE)>IDLE||(e.gpu?.count!==undefined&&Number(e.gpu.count)!==1))throw new Error('working_cos_evaluator_endpoint_policy_drift')
  return Object.freeze({binding,endpointId:e.id,modelName,createdTemplate,createdEndpoint,baseUrl:`https://${e.id}.api.runpod.ai/v1`})
}

export async function canaryWorkingCosEvaluator(input:{endpointId:string;modelName:string;baseModelId:string;baseRevision:string;adapterRevision:string}){
  const key=configuredRunpodApiKey();if(!key)throw new Error('RUNPOD_API_KEY is not configured')
  const root=`https://${input.endpointId}.api.runpod.ai`,deadline=Date.now()+READY_MS
  let last:string|null=null
  while(Date.now()<deadline){try{const r=await fetch(root+'/ping',{headers:{Authorization:`Bearer ${key}`},signal:AbortSignal.timeout(Math.min(10000,Math.max(1000,deadline-Date.now())))});const raw=await r.text();if(r.status===200){const p:any=raw?JSON.parse(raw):{};if(p.modelReady===true&&p.model===input.modelName&&p.baseRevision===input.baseRevision&&p.adapterRevision===input.adapterRevision)break;last='working_cos_canary_identity_mismatch'}else last=`HTTP ${r.status}`}catch(e){last=e instanceof Error?clean(e.message):'ready_failed'};await new Promise(r=>setTimeout(r,3000))}
  if(Date.now()>=deadline)return {ok:false,error:last||'working_cos_evaluator_not_ready'}
  for(const model of [input.baseModelId,input.modelName]){
    const r=await fetch(root+'/v1/chat/completions',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({model,max_tokens:48,temperature:0,messages:[{role:'system',content:'Return one concise sentence. Do not reveal hidden reasoning.'},{role:'user',content:'State that evidence and inference must be kept separate.'}]}),signal:AbortSignal.timeout(REQUEST_MS)})
    const raw=await r.text();if(!r.ok)return {ok:false,error:`working_cos_canary_http_${r.status}:${clean(raw,160)}`}
    let p:any={};try{p=JSON.parse(raw)}catch{};if(!clean(p?.choices?.[0]?.message?.content,1000))return {ok:false,error:'working_cos_canary_empty'}
  }
  return {ok:true,error:null,exactArtifact:true,baselineAndTrained:true}
}

export const WORKING_COS_EVALUATOR_MAX_HOURLY_COST_USD=MAX_HOURLY_USD
export const WORKING_COS_EVALUATOR_IDLE_TIMEOUT_SECONDS=IDLE
