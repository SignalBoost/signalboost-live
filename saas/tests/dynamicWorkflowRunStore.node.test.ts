import assert from 'node:assert/strict'
import test from 'node:test'
import { createDynamicWorkflowRunCheckpointStore } from '../lib/agentic/dynamicWorkflowRunStore.ts'
const userId='11111111-1111-4111-8111-111111111111'
const runId='22222222-2222-4222-8222-222222222222'
const state={workflowId:'support',definitionRevision:1,status:'running',completedSteps:[],receipts:{},inFlightStep:null}
test('checkpoint is fenced by owner, definition, revision, and generation',async()=>{
 let generation=0
 let stored:any=state
 const query:any={
  select(){return this},eq(key:string,value:any){this.filters[key]=value;return this},
  async maybeSingle(){return {data:{generation,state:stored},error:null}},
  then(resolve:any){if(this.filters.generation===generation&&this.filters.user_id===userId&&this.filters.id===runId&&this.filters.workflow_id==='support'&&this.filters.definition_revision===1){generation=this.patch.generation;stored=this.patch.state;return Promise.resolve(resolve({data:[{id:runId}],error:null}))}return Promise.resolve(resolve({data:[],error:null}))},
 }
 const db:any={from(name:string){assert.equal(name,'agentic_workflow_runs');return {
  select(){query.filters={};return query},
  update(patch:any){query.filters={};query.patch=patch;return query},
 }}}
 const store=createDynamicWorkflowRunCheckpointStore(db,userId)
 assert.equal(await store.save(runId,0,state as any),1)
 await assert.rejects(()=>store.save(runId,0,state as any),/conflict/)
 assert.equal((await store.load(runId))?.generation,1)
})
test('invalid owner and oversized state fail closed',async()=>{
 assert.throws(()=>createDynamicWorkflowRunCheckpointStore({} as any,'invalid'),/invalid_owner/)
 const db:any={from(){throw Error('database must not be touched')}}
 const store=createDynamicWorkflowRunCheckpointStore(db,userId)
 await assert.rejects(()=>store.save(runId,0,{...state,receipts:{huge:'x'.repeat(66000)}} as any),/too_large/)
})
