import test from 'node:test'
import assert from 'node:assert/strict'
import { migrateHistoricalWorkflowDefinition, validateDynamicWorkflowDefinition } from '../lib/agentic/workflowContract.ts'

const capabilities = new Set(['research','verify'])
test('historical advisory workflow migrates into canonical persisted schema',()=>{
 const migrated=migrateHistoricalWorkflowDefinition({
  id:'retirement-advice',version:1,objective:'Answer the customer question',
  steps:[{id:'research',capability:'research',dependsOn:[]},{id:'verify',capability:'verify',dependsOn:['research']}],
 },capabilities)
 assert.equal(migrated.description,'Answer the customer question')
 assert.equal(validateDynamicWorkflowDefinition(JSON.parse(JSON.stringify(migrated)),capabilities).steps.length,2)
})
test('historical approval requirements cannot be silently dropped',()=>{
 assert.throws(()=>migrateHistoricalWorkflowDefinition({
  id:'builder-repair',version:1,objective:'Repair the project',
  steps:[{id:'edit',capability:'research',dependsOn:[],requiresApproval:true}],
 },capabilities),/approval_not_representable/)
})
test('unregistered capabilities and unrepresentable dependency order fail closed',()=>{
 assert.throws(()=>migrateHistoricalWorkflowDefinition({
  id:'support',version:1,objective:'Help customer',
  steps:[{id:'first',capability:'shell',dependsOn:[]}],
 },capabilities),/unregistered_capability/)
 assert.throws(()=>migrateHistoricalWorkflowDefinition({
  id:'support',version:1,objective:'Help customer',
  steps:[{id:'first',capability:'verify',dependsOn:['later']},{id:'later',capability:'research',dependsOn:[]}],
 },capabilities),/dependency_invalid_or_out_of_order/)
})
