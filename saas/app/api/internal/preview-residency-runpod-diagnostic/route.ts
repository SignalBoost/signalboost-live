import { NextResponse } from 'next/server'
import { configuredRunpodApiKey } from '../../../../lib/ai/cos/runpodConfig.ts'

export const dynamic = 'force-dynamic'

const CONTROL_API='https://api.runpod.io/v2'
const SERVERLESS_API='https://api.runpod.ai/v2'
const EXACT_ENDPOINT_NAME='itmounts-mass-distilled-c5c93a8f4b3a-1baf2c57f9-v3'
const TIMEOUT_MS=8_000

function clean(value:unknown,max=240){
  return String(value??'').replace(/\s+/g,' ').trim().slice(0,max)
}

async function readJson(url:string,key:string){
  const response=await fetch(url,{
    headers:{Authorization:`Bearer ${key}`},
    signal:AbortSignal.timeout(TIMEOUT_MS),
    cache:'no-store',
  })
  const raw=await response.text()
  let payload:any=null
  try{payload=raw?JSON.parse(raw):null}catch{}
  return {ok:response.ok,status:response.status,payload}
}

function endpointView(endpoint:any){
  return {
    id:clean(endpoint?.id,160),
    name:clean(endpoint?.name,240),
    type:clean(endpoint?.type,80),
    workers:{
      min:Number(endpoint?.workers?.min??0),
      max:Number(endpoint?.workers?.max??0),
      idleTimeout:Number(endpoint?.workers?.idleTimeout??0),
    },
    gpu:{
      pools:Array.isArray(endpoint?.gpu?.pools)?endpoint.gpu.pools.map((v:unknown)=>clean(v,80)):[],
      count:Number(endpoint?.gpu?.count??0),
    },
    ports:Array.isArray(endpoint?.ports)?endpoint.ports.map((v:unknown)=>clean(v,80)):[],
    envKeys:endpoint?.env&&typeof endpoint.env==='object'?Object.keys(endpoint.env).sort():[],
    hasArgs:Boolean(clean(endpoint?.args,20_000)),
  }
}

function healthView(payload:any){
  return {
    jobs:{
      inProgress:Number(payload?.jobs?.inProgress??0),
      inQueue:Number(payload?.jobs?.inQueue??0),
      failed:Number(payload?.jobs?.failed??0),
      completed:Number(payload?.jobs?.completed??0),
    },
    workers:{
      idle:Number(payload?.workers?.idle??0),
      ready:Number(payload?.workers?.ready??0),
      running:Number(payload?.workers?.running??0),
      initializing:Number(payload?.workers?.initializing??0),
    },
  }
}

function workerView(worker:any){
  return {
    id:clean(worker?.id??worker?.workerId,160),
    status:clean(worker?.status??worker?.state,120),
    desiredStatus:clean(worker?.desiredStatus,120),
    createdAt:clean(worker?.createdAt??worker?.created_at,120),
    startedAt:clean(worker?.startedAt??worker?.started_at,120),
    stoppedAt:clean(worker?.stoppedAt??worker?.stopped_at,120),
    gpuType:clean(worker?.gpuType??worker?.gpu?.type??worker?.gpu?.displayName,120),
    error:clean(worker?.error??worker?.lastError,240),
  }
}

export async function GET(){
  if(process.env.VERCEL_ENV!=='preview'){
    return new NextResponse(null,{status:404})
  }
  const key=configuredRunpodApiKey()
  if(!key) return NextResponse.json({ok:false,error:'runpod_key_missing'},{status:503})

  try{
    const listed=await readJson(`${CONTROL_API}/serverless`,key)
    if(!listed.ok){
      return NextResponse.json({ok:false,stage:'list_endpoints',httpStatus:listed.status},{status:502})
    }
    const endpoints=Array.isArray(listed.payload?.endpoints)?listed.payload.endpoints:[]
    const endpoint=endpoints.find((item:any)=>clean(item?.name,240)===EXACT_ENDPOINT_NAME)
    if(!endpoint?.id){
      return NextResponse.json({
        ok:false,
        stage:'exact_endpoint_lookup',
        exactEndpointName:EXACT_ENDPOINT_NAME,
        matchingNames:endpoints
          .map((item:any)=>clean(item?.name,240))
          .filter((name:string)=>name.includes('c5c93a8f4b3a'))
          .slice(0,10),
      },{status:404})
    }

    const endpointId=clean(endpoint.id,160)
    const [health,workers]=await Promise.all([
      readJson(`${SERVERLESS_API}/${encodeURIComponent(endpointId)}/health`,key),
      readJson(`${CONTROL_API}/serverless/${encodeURIComponent(endpointId)}/workers`,key),
    ])
    const workerItems=Array.isArray(workers.payload?.workers)
      ?workers.payload.workers
      :Array.isArray(workers.payload)
        ?workers.payload
        :[]

    return NextResponse.json({
      ok:true,
      exactEndpointName:EXACT_ENDPOINT_NAME,
      endpoint:endpointView(endpoint),
      health:{
        ok:health.ok,
        httpStatus:health.status,
        ...(health.payload?healthView(health.payload):{}),
      },
      workers:{
        ok:workers.ok,
        httpStatus:workers.status,
        count:workerItems.length,
        items:workerItems.slice(0,8).map(workerView),
        payloadKeys:workers.payload&&typeof workers.payload==='object'
          ?Object.keys(workers.payload).sort().slice(0,30)
          :[],
      },
      authority:{
        readOnly:true,
        mutationAuthorized:false,
        modelInvocationAuthorized:false,
        productionTrafficAuthorized:false,
      },
    })
  }catch(error){
    return NextResponse.json({
      ok:false,
      stage:'diagnostic_request',
      error:error instanceof Error?clean(error.message,240):'diagnostic_failed',
    },{status:502})
  }
}
