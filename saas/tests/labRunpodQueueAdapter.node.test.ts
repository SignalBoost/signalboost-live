import assert from 'node:assert/strict'
import test from 'node:test'
import { submitRunpodJob, getRunpodJob, cancelRunpodJob, retryRunpodJob } from '../lib/lab/labRunpodQueueAdapter.ts'
type Call={url:string;method:string;body?:string;headers:Headers}
function fake(routes:Record<string,[number,unknown]>) {
 const calls:Call[]=[]
 const fetcher=async(url:string,init:RequestInit={})=>{
  const method=String(init.method??'GET')
  calls.push({url,method,body:String(init.body??''),headers:new Headers(init.headers)})
  const [status,body]=routes[method+' '+url]??[404,{}]
  return new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}})
 }
 return {fetcher,calls}
}
const base='https://api.runpod.ai/v2/owned-endpoint'
test('reproduce RunPod /run /status /cancel wire protocol with a BYOI key',async()=>{
 const {fetcher,calls}=fake({
  ['POST '+base+'/run']:[200,{id:'job-123',status:'IN_QUEUE'}],
  ['GET '+base+'/status/job-123']:[200,{id:'job-123',status:'COMPLETED',output:{model:'artifact-v1'}}],
  ['POST '+base+'/cancel/job-123']:[200,{id:'job-123',status:'CANCELLED'}],
 })
 const input={key:'customer-token',endpointId:'owned-endpoint',fetcher}
 assert.equal((await submitRunpodJob({...input,payload:{run_id:'run-a',task:'train'}})).state,'queued')
 const complete=await getRunpodJob({...input,jobId:'job-123'})
 assert.equal(complete.state,'completed')
 assert.deepEqual(complete.output,{model:'artifact-v1'})
 assert.equal((await cancelRunpodJob({...input,jobId:'job-123'})).state,'cancelled')
 assert.deepEqual(calls.map(c=>c.method+' '+c.url),['POST '+base+'/run','GET '+base+'/status/job-123','POST '+base+'/cancel/job-123'])
 assert.deepEqual(JSON.parse(calls[0].body!),{input:{run_id:'run-a',task:'train'}})
 assert.equal(calls[0].headers.get('authorization'),'customer-token')
 assert.equal(calls[1].headers.get('content-type'),null)
})
test('retry is allowed only after observing failure; never duplicate unknown job',async()=>{
 const {fetcher,calls}=fake({
  ['GET '+base+'/status/job-123']:[200,{id:'job-123',status:'FAILED'}],
  ['POST '+base+'/retry/job-123']:[200,{id:'job-123',status:'IN_QUEUE'}],
 })
 const result=await retryRunpodJob({key:'customer-token',endpointId:'owned-endpoint',jobId:'job-123',fetcher})
 assert.deepEqual([result.jobId,result.state],['job-123','queued'])
 assert.equal(calls.length,2)
 const active=fake({['GET '+base+'/status/job-123']:[200,{id:'job-123',status:'IN_PROGRESS'}]})
 await assert.rejects(retryRunpodJob({key:'customer-token',endpointId:'owned-endpoint',jobId:'job-123',fetcher:active.fetcher}),/retry_not_allowed/)
 assert.equal(active.calls.length,1)
})
test('reject traversal and fail closed on unconfirmed provider submission',async()=>{
 let called=false
 const noFetch=async()=>{called=true;throw Error('unexpected')}
 await assert.rejects(getRunpodJob({key:'k',endpointId:'owned-endpoint',jobId:'../../secrets',fetcher:noFetch}),/id_invalid/)
 assert.equal(called,false)
 await assert.rejects(submitRunpodJob({key:'k',endpointId:'owned-endpoint',payload:null,fetcher:noFetch}),/input_invalid/)
 assert.equal(called,false)
 await assert.rejects(submitRunpodJob({key:'k',endpointId:'owned-endpoint',payload:{ok:true},fetcher:noFetch}),/transport_unconfirmed/)
 assert.equal(called,true)
})
test('provider errors are classified but never leak provider error bodies',async()=>{
 const f=fake({['GET '+base+'/status/job-123']:[429,{error:'sensitive'}]})
 await assert.rejects(getRunpodJob({key:'k',endpointId:'owned-endpoint',jobId:'job-123',fetcher:f.fetcher}),/rate_limited/)
})
