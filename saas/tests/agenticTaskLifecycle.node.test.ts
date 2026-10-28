import test from 'node:test'
import assert from 'node:assert/strict'
import { beginAgenticTask, advanceAgenticTask, outstandingAgenticRequirements, validateDynamicWorkflow, executeDynamicWorkflow, beginWorkflowCheckpoint, inspectWorkflowRecovery, writeWorkflowCheckpoint, loadWorkflowCheckpoint, type WorkflowCheckpointStore, type VersionedWorkflowCheckpoint } from '../lib/agentic/taskLifecycle.ts'

test('unverified claims cannot complete an agentic task', () => {
 const state=beginAgenticTask('Repair the source and prove the change', ['source','tests'])
 assert.equal(state.status,'working')
 assert.deepEqual(outstandingAgenticRequirements(state),['source','tests'])
})
test('host receipts fulfill individual requirements and survive JSON checkpoint replay', () => {
 const task=beginAgenticTask('Build and test', ['source','tests'])
 const changed=advanceAgenticTask(task,{type:'receipt',id:'write:1',satisfies:['source']})
 const reloaded=JSON.parse(JSON.stringify(changed))
 const complete=advanceAgenticTask(reloaded,{type:'receipt',id:'test:exit0',satisfies:['tests']})
 assert.equal(complete.status,'completed')
 assert.deepEqual(complete.receipts,['write:1','test:exit0'])
})
test('duplicate receipts are ignored and no-progress calls switch strategy', () => {
 const task=beginAgenticTask('Repair', ['tests'])
 const first=advanceAgenticTask(task,{type:'receipt',id:'test:failed'})
 assert.equal(advanceAgenticTask(first,{type:'receipt',id:'test:failed'}),first)
 const stuck=advanceAgenticTask(advanceAgenticTask(first,{type:'no-progress'}),{type:'no-progress'})
 assert.equal(stuck.status,'change-strategy')
 assert.equal(advanceAgenticTask(stuck,{type:'budget-exhausted'}).status,'blocked-budget')
})

test('dynamic workflow validates an advisory research sequence without granting execution', () => {
 const def={id:'retirement-advice',version:1,objective:'Answer age-65 extension question',steps:[
  {id:'research',capability:'research',dependsOn:[]},
  {id:'verify',capability:'verify',dependsOn:['research']},
  {id:'answer',capability:'answer',dependsOn:['verify']},
 ]}
 const result=validateDynamicWorkflow(JSON.parse(JSON.stringify(def)),['research','verify','answer'])
 assert.equal(result.valid,true)
 assert.equal(result.executionAuthorized,false)
})
test('dynamic workflow refuses unknown tools, injected code, missing dependencies and cycles', () => {
 const base={id:'builder-repair',version:1,objective:'Repair project with approval',steps:[
  {id:'build',capability:'builder',dependsOn:['test'],requiresApproval:true},
  {id:'test',capability:'verify',dependsOn:['build']},
 ]}
 const result=validateDynamicWorkflow(base,['builder','verify'])
 assert.equal(result.valid,false)
 assert.ok(result.errors.includes('cycle_detected'))
 const injected=validateDynamicWorkflow({...base,steps:[{id:'steal',capability:'shell',dependsOn:[],execute:'rm -rf /'}]},['builder','verify'])
 assert.ok(injected.errors.includes('unregistered_capability'))
 assert.ok(injected.errors.includes('unexpected_step_field'))
 assert.equal(injected.executionAuthorized,false)
})

test('dynamic execution requires a version-bound host grant and returns receipts in dependency order',async()=>{
 const def={id:'retirement-advice',version:1,objective:'Answer the question, not rewrite the cable',steps:[
  {id:'research',capability:'research',dependsOn:[]},
  {id:'verify',capability:'verify',dependsOn:['research']},
  {id:'answer',capability:'answer',dependsOn:['verify']},
 ]}
 const called:string[]=[]
 const handlers=Object.fromEntries(['research','verify','answer'].map(capability=>[capability,async()=>{called.push(capability);return 'host:'+capability}]))
 const denied=await executeDynamicWorkflow(def,handlers,null)
 assert.equal(denied.status,'blocked')
 assert.equal(called.length,0)
 const stale=await executeDynamicWorkflow(def,handlers,{workflowId:def.id,version:2,allowedCapabilities:['research','verify','answer'],approvedStepIds:[]})
 assert.equal(stale.reason,'missing_or_stale_grant')
 const result=await executeDynamicWorkflow(def,handlers,{workflowId:def.id,version:1,allowedCapabilities:['research','verify','answer'],approvedStepIds:[]})
 assert.equal(result.status,'completed')
 assert.deepEqual(called,['research','verify','answer'])
 assert.deepEqual(result.receipts.map(r=>r.evidenceId),['host:research','host:verify','host:answer'])
})
test('dynamic execution blocks unapproved Builder side effects and missing evidence',async()=>{
 const def={id:'builder-repair',version:1,objective:'Repair software',steps:[{id:'edit',capability:'builder',dependsOn:[],requiresApproval:true}]}
 let runs=0
 const handler={builder:async()=>{runs++;return 'host:edit'}}
 const grant={workflowId:def.id,version:1,allowedCapabilities:['builder'],approvedStepIds:[]}
 const blocked=await executeDynamicWorkflow(def,handler,grant)
 assert.equal(blocked.reason,'authorization_required')
 assert.equal(runs,0)
 const missing=await executeDynamicWorkflow(def,{builder:async()=>''},{...grant,approvedStepIds:['edit']})
 assert.equal(missing.reason,'missing_host_receipt')
 assert.equal(missing.status,'blocked')
})

test('checkpoint recovery rejects replay of potentially committed side effects',()=>{
 const def={id:'builder-repair',version:2,objective:'Verify repair',steps:[
  {id:'write',capability:'builder',dependsOn:[]},
  {id:'test',capability:'verify',dependsOn:['write']},
 ]}
 const start=beginWorkflowCheckpoint(def)
 assert.deepEqual(inspectWorkflowRecovery(def,start).pending,['write','test'])
 const ambiguous={...start,inFlightStep:'write'}
 assert.equal(inspectWorkflowRecovery(def,ambiguous).reason,'in_flight_requires_reconciliation')
 const afterWrite={...start,completed:[{id:'write',capability:'builder',evidenceId:'authoritative:1'}]}
 const restored=JSON.parse(JSON.stringify(afterWrite))
 assert.deepEqual(inspectWorkflowRecovery(def,restored).pending,['test'])
 assert.equal(inspectWorkflowRecovery({...def,version:3},restored).reason,'checkpoint_version_mismatch')
 const fake={...start,completed:[{id:'test',capability:'verify',evidenceId:'fake'}]}
 assert.equal(inspectWorkflowRecovery(def,fake).reason,'invalid_checkpoint_receipts')
})

test('checkpoint store enforces revisions and blocks in-flight recovery',async()=>{
 const def={id:'repair-flow',version:1,objective:'Repair only with approval',steps:[{id:'build',capability:'builder',dependsOn:[]}]}
 const data=new Map<string,VersionedWorkflowCheckpoint>()
 const store:WorkflowCheckpointStore={
  async read(id){return data.get(id)??null},
  async compareAndSwap(id,rev,next){
   const current=data.get(id)
   if ((current?.revision??null)!==rev) return false
   data.set(id,structuredClone(next));return true
  },
 }
 const start=beginWorkflowCheckpoint(def)
 assert.deepEqual(await writeWorkflowCheckpoint(store,'run_0001',def,null,start),{status:'stored',revision:0})
 assert.equal((await loadWorkflowCheckpoint(store,'run_0001',def)).status,'ready')
 const inFlight={...start,inFlightStep:'build'}
 assert.deepEqual(await writeWorkflowCheckpoint(store,'run_0001',def,0,inFlight),{status:'stored',revision:1})
 assert.equal((await loadWorkflowCheckpoint(store,'run_0001',def)).reason,'in_flight_requires_reconciliation')
 const stale=await writeWorkflowCheckpoint(store,'run_0001',def,0,start)
 assert.equal(stale.status,'conflict')
 const invalid=await writeWorkflowCheckpoint(store,'run_0001',{...def,version:2},1,start)
 assert.equal(invalid.status,'invalid')
})

test('Supabase checkpoint adapter uses atomic RPC, never client-side read-then-write',()=>{
 const adapter=readFileSync(new URL('../lib/agentic/workflow-checkpoint-supabase.ts',import.meta.url),'utf8')
 const schema=readFileSync(new URL('../../docs/agentic-workflow-checkpoint-schema.sql',import.meta.url),'utf8')
 assert.match(adapter,/client\.rpc\('agentic_workflow_checkpoint_cas'/)
 assert.match(schema,/where run_id=p_run_id and revision=p_expected_revision/)
 assert.match(schema,/on conflict \(run_id\) do nothing/)
 assert.match(schema,/enable row level security/)
 assert.match(schema,/revoke all on function .* from public, anon, authenticated/)
 assert.doesNotMatch(adapter,/NEXT_PUBLIC_SUPABASE_SECRET/)
})
