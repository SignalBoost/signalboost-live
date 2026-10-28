import type { DynamicWorkflowDefinition } from './dynamicWorkflowDefinition.ts'

export type DynamicWorkflowRun = Readonly<{
  workflowId: string
  definitionRevision: number
  status: 'running' | 'completed' | 'blocked'
  completedSteps: readonly string[]
  receipts: Readonly<Record<string,string>>
  inFlightStep: string | null
}>
export function startDynamicWorkflowRun(definition:DynamicWorkflowDefinition,revision:number):DynamicWorkflowRun {
  if(!Number.isSafeInteger(revision)||revision<1)throw new Error('workflow_run_invalid_revision')
  return {workflowId:definition.id,definitionRevision:revision,status:'running',completedSteps:[],receipts:{},inFlightStep:null}
}
/** A run is pinned to its original definition revision: replacements cannot change active runs. */
export function nextDynamicWorkflowStep(run:DynamicWorkflowRun,definition:DynamicWorkflowDefinition):string|null {
  if(run.workflowId!==definition.id)throw new Error('workflow_run_definition_mismatch')
  if(run.status!=='running'||run.inFlightStep)return null
  const done=new Set(run.completedSteps)
  return definition.steps.find(step=>!done.has(step.id)&&step.dependsOn.every(dep=>done.has(dep)))?.id??null
}
/** Claim one step before any host-side tool execution. Persist the claim before dispatch. */
export function claimDynamicWorkflowStep(run:DynamicWorkflowRun,stepId:string,definition:DynamicWorkflowDefinition):DynamicWorkflowRun {
  if(nextDynamicWorkflowStep(run,definition)!==stepId)throw new Error('workflow_step_not_ready')
  return {...run,inFlightStep:stepId}
}
/** A receipt must be supplied by the host verifier, never by a model answer. */
export function completeDynamicWorkflowStep(run:DynamicWorkflowRun,stepId:string,receiptId:string,definition:DynamicWorkflowDefinition):DynamicWorkflowRun {
  if(run.inFlightStep!==stepId||!receiptId.trim()||run.receipts[stepId])throw new Error('workflow_step_receipt_invalid')
  if(!definition.steps.some(x=>x.id===stepId))throw new Error('workflow_step_unknown')
  const completedSteps=[...run.completedSteps,stepId]
  return {...run,completedSteps,receipts:{...run.receipts,[stepId]:receiptId},inFlightStep:null,status:completedSteps.length===definition.steps.length?'completed':'running'}
}
/** After a crash a claimed step is BLOCKED, never automatically replayed: host must reconcile side effects. */
export function recoverDynamicWorkflowRun(run:DynamicWorkflowRun):DynamicWorkflowRun {
  return run.inFlightStep?{...run,status:'blocked'}:run
}
