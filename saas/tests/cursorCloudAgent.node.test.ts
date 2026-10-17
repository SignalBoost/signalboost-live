import test from 'node:test'
import assert from 'node:assert/strict'
import { CursorCloudAgent } from '../lib/builder/cursor-cloud-agent.ts'

test('Cursor cloud creates a durable run with bounded approved repo and no external source code',async()=>{
  const calls:any[]=[]
  const api=new CursorCloudAgent('test-key',async(url,init)=>{
    calls.push({url,init})
    return {ok:true,status:201,json:async()=>({agent:{id:'bc-test',url:'https://cursor.com/agents/bc-test'},run:{id:'run-test'}})}
  })
  const handle=await api.start({repositoryUrl:'https://github.com/SignalBoost/signalboost-live',startingRef:'main',objective:'Repair Builder'})
  assert.deepEqual(handle,{agentId:'bc-test',runId:'run-test',url:'https://cursor.com/agents/bc-test'})
  assert.equal(calls.length,1)
  assert.equal(calls[0].url,'https://api.cursor.com/v1/agents')
  const body=JSON.parse(String(calls[0].init.body))
  assert.equal(body.autoCreatePR,true)
  assert.equal(body.repos[0].startingRef,'main')
  assert.equal(body.prompt.text,'Repair Builder')
})
test('Cursor cloud rejects unknown host before dispatch',async()=>{
  let invoked=false
  const api=new CursorCloudAgent('key',async()=>{invoked=true;throw Error('should not call')})
  await assert.rejects(api.start({repositoryUrl:'https://evil.example/repo',startingRef:'main',objective:'do something'}),/cursor_repository_not_approved/)
  assert.equal(invoked,false)
})
test('Cursor cloud resumes only after terminal run',async()=>{
  const requests:any[]=[]
  const api=new CursorCloudAgent('key',async(url,init)=>{
    requests.push({url,init})
    if(init.method==='GET')return {ok:true,status:200,json:async()=>({status:'FINISHED'})}
    return {ok:true,status:200,json:async()=>({id:'run-next'})}
  })
  const out=await api.repair({agentId:'bc-abc',runId:'run-abc',url:'https://cursor.com/agents/bc-abc'},'npm test exit 1')
  assert.equal(out.runId,'run-next')
  assert.match(String(requests[1].init.body),/npm test exit 1/)
})
test('Cursor cloud blocks follow-up while run is active',async()=>{
  const api=new CursorCloudAgent('key',async()=>({ok:true,status:200,json:async()=>({status:'RUNNING'})}))
  await assert.rejects(api.repair({agentId:'bc-abc',runId:'run-abc',url:'x'},'failed'),/cursor_agent_still_running/)
})
