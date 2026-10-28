import type { DynamicWorkflowDefinition } from './dynamicWorkflowDefinition.ts'
import type { DynamicWorkflowRun } from './dynamicWorkflowRun.ts'
import {claimDynamicWorkflowStep,completeDynamicWorkflowStep,nextDynamicWorkflowStep,recoverDynamicWorkflowRun} from './dynamicWorkflowRun.ts'

type Checkpoint = {generation:number;state:DynamicWorkflowRun}
type Store = {load(runId:string):Promise<Checkpoint|null>;save(runId:string,generation:number,state:DynamicWorkflowRun):Promise<number>}
type Receipt = Readonly<{id:string; verified:boolean}>
type Capability = (context:Readonly<{runId:string;stepId:string;claimGeneration:number}>)=>Promise<Receipt>

/**
 * Execute at most one governed step. Host-selected capabilities only.
 * Every claim is persisted before invocation. A crash or missing proof blocks
 * continuation for operator reconciliation, never automatic repeated effects.
 */
export async function executeGovernedWorkflowStep(input:Readonly<{
 runId:string
 definition:DynamicWorkflowDefinition
 store:Store
 capabilities:Readonly<Record<string,Capability>>
 authorize:(capability:string)=>Promise<boolean>
}>):Promise<Checkpoint> {
 const checkpoint=await input.store.load(input.runId)
 if(!checkpoint)throw new Error('workflow_run_not_found')
 const {generation,state}=checkpoint
 if(state.workflowId!==input.definition.id)throw new Error('workflow_definition_mismatch')
 if(state.status!=='running'||state.inFlightStep)return checkpoint
 const stepId=nextDynamicWorkflowStep(state,input.definition)
 if(!stepId)return checkpoint
 const step=input.definition.steps.find(s=>s.id===stepId)!
 const tool=input.capabilities[step.capability]
 if(typeof tool!=='function'||!await input.authorize(step.capability))throw new Error('workflow_capability_not_authorized')
 const claimed=claimDynamicWorkflowStep(state,stepId,input.definition)
 const claimedGeneration=await input.store.save(input.runId,generation,claimed)
 try {
  const receipt=await tool({runId:input.runId,stepId,claimGeneration:claimedGeneration})
  if(!receipt?.verified||typeof receipt.id!=='string'||!receipt.id.trim())throw new Error('workflow_receipt_unverified')
  const completed=completeDynamicWorkflowStep(claimed,stepId,receipt.id,input.definition)
  const nextGeneration=await input.store.save(input.runId,claimedGeneration,completed)
  return {generation:nextGeneration,state:completed}
 } catch(error) {
  const blocked=recoverDynamicWorkflowRun(claimed)
  try {await input.store.save(input.runId,claimedGeneration,blocked)} catch { /* preserve original failure and persisted claim */ }
  throw error
 }
}
