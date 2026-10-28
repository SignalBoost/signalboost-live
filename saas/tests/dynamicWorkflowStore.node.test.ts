import assert from 'node:assert/strict'
import test from 'node:test'
import { createDynamicWorkflowDefinitionStore } from '../lib/agentic/dynamicWorkflowStore.ts'
const owner='11111111-1111-4111-8111-111111111111'
const definition={id:'support',version:1,description:'Verified customer response',steps:[{id:'research',capability:'research',dependsOn:[]}]}
test('workflow store validates, versions, and scopes every query to the owner',async()=>{
 const rows:any[]=[]
 const query=()=>({
   select(){return this},eq(k:string,v:unknown){assert.ok(k==='user_id'||k==='workflow_id');if(k==='user_id')assert.equal(v,owner);return this},
   order(){return this},limit(){return this},
   async maybeSingle(){const row=rows.at(-1);return {data:row??null,error:null}},
 })
 const db:any={from(name:string){assert.equal(name,'agentic_workflow_definitions');return {...query(),async insert(row:unknown){rows.push(row);return {error:null}}}}}
 const store=createDynamicWorkflowDefinitionStore(db,owner,new Set(['research']))
 const first=await store.register(definition,0)
 assert.equal(first.revision,1)
 await assert.rejects(()=>store.register(definition,0),/revision_conflict/)
 const second=await store.register(definition,1)
 assert.equal(second.revision,2)
 assert.equal((await store.latest('support'))?.revision,2)
 assert.equal(rows[0].user_id,owner)
})
test('invalid capability fails before storage is touched',async()=>{
 const db:any={from(){throw Error('must not access db')}}
 const store=createDynamicWorkflowDefinitionStore(db,owner,new Set(['research']))
 await assert.rejects(()=>store.register({...definition,steps:[{id:'shell',capability:'shell',dependsOn:[]}]},0),/unregistered_capability/)
})
