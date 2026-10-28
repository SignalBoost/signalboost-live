/**
 * Host-owned task lifecycle shared by COS and Builder. This pure reducer never
 * authorizes tools; the existing harness remains responsible for permissions.
 */
export type AgenticTaskState = Readonly<{
  objective: string
  requirements: readonly string[]
  verified: readonly string[]
  receipts: readonly string[]
  status: 'working' | 'change-strategy' | 'blocked-budget' | 'completed'
  noProgressSteps: number
}>
export type AgenticTaskEvent =
  | Readonly<{type:'receipt'; id:string; satisfies?:readonly string[]}>
  | Readonly<{type:'no-progress'}>
  | Readonly<{type:'budget-exhausted'}>
export function beginAgenticTask(objective:string, requirements:readonly string[]):AgenticTaskState {
  if (!objective.trim()) throw new Error('agentic_objective_required')
  return {objective,requirements:[...new Set(requirements)],verified:[],receipts:[],status:'working',noProgressSteps:0}
}
export function advanceAgenticTask(state:AgenticTaskState,event:AgenticTaskEvent):AgenticTaskState {
  if(state.status==='completed'||state.status==='blocked-budget') return state
  if(event.type==='budget-exhausted') return {...state,status:'blocked-budget'}
  if(event.type==='no-progress') {
    const count=state.noProgressSteps+1
    return {...state,noProgressSteps:count,status:count>=2?'change-strategy':'working'}
  }
  if(!event.id.trim()||state.receipts.includes(event.id)) return state
  const verified=[...new Set([...state.verified,...(event.satisfies??[]).filter(r=>state.requirements.includes(r))])]
  const receipts=[...state.receipts,event.id]
  const completed=state.requirements.length>0&&state.requirements.every(r=>verified.includes(r))
  return {...state,verified,receipts,noProgressSteps:0,status:completed?'completed':'working'}
}
export function outstandingAgenticRequirements(state:AgenticTaskState):readonly string[] {
  return state.requirements.filter(r=>!state.verified.includes(r))
}

/**
 * Data-only dynamic workflow proposal. No code, closures, arbitrary tool names,
 * or autonomous side effects are accepted at this boundary. Registration and
 * execution require separate host authorization.
 */
export type DynamicWorkflowDefinition = Readonly<{
  id: string
  version: number
  objective: string
  steps: readonly Readonly<{
    id: string
    capability: string
    dependsOn: readonly string[]
    requiresApproval?: boolean
  }>[]
}>

export type DynamicWorkflowValidation = Readonly<{
  valid: boolean
  errors: readonly string[]
  executionAuthorized: false
}>

/** Host registry allowlist is authoritative; the model cannot invent tools. */
export function validateDynamicWorkflow(
  definition: unknown,
  registeredCapabilities: readonly string[],
): DynamicWorkflowValidation {
  const errors: string[] = []
  if (!definition || typeof definition !== 'object' || Array.isArray(definition)) {
    return { valid: false, errors: ['definition_not_object'], executionAuthorized: false }
  }
  const data = definition as Record<string, unknown>
  const id = data.id
  if (typeof id !== 'string' || !/^[a-z][a-z0-9-]{2,63}$/.test(id)) errors.push('invalid_workflow_id')
  if (!Number.isSafeInteger(data.version) || Number(data.version) < 1) errors.push('invalid_version')
  if (typeof data.objective !== 'string' || !data.objective.trim() || data.objective.length > 4000) errors.push('invalid_objective')
  if (!Array.isArray(data.steps) || data.steps.length < 1 || data.steps.length > 24) {
    errors.push('invalid_steps')
    return { valid: false, errors, executionAuthorized: false }
  }
  const ids = new Set<string>()
  const permitted = new Set(registeredCapabilities)
  const edges = new Map<string, readonly string[]>()
  for (const step of data.steps as unknown[]) {
    if (!step || typeof step !== 'object' || Array.isArray(step)) { errors.push('invalid_step'); continue }
    const item = step as Record<string, unknown>
    if (typeof item.id !== 'string' || !/^[a-z][a-z0-9-]{1,63}$/.test(item.id) || ids.has(item.id)) errors.push('invalid_or_duplicate_step_id')
    else ids.add(item.id)
    if (typeof item.capability !== 'string' || !permitted.has(item.capability)) errors.push('unregistered_capability')
    if (!Array.isArray(item.dependsOn) || !item.dependsOn.every(dep => typeof dep === 'string')) errors.push('invalid_dependencies')
    else if (typeof item.id === 'string') edges.set(item.id, item.dependsOn as string[])
    if (item.requiresApproval !== undefined && typeof item.requiresApproval !== 'boolean') errors.push('invalid_approval_flag')
    if (Object.keys(item).some(key => !['id','capability','dependsOn','requiresApproval'].includes(key))) errors.push('unexpected_step_field')
  }
  if (Object.keys(data).some(key => !['id','version','objective','steps'].includes(key))) errors.push('unexpected_definition_field')
  const visiting = new Set<string>(), visited = new Set<string>()
  const visit = (id: string): void => {
    if (visiting.has(id)) { errors.push('cycle_detected'); return }
    if (visited.has(id)) return
    visiting.add(id)
    for (const dep of edges.get(id) ?? []) {
      if (!ids.has(dep)) errors.push('missing_dependency')
      else visit(dep)
    }
    visiting.delete(id); visited.add(id)
  }
  for (const id of ids) visit(id)
  return { valid: errors.length === 0, errors: [...new Set(errors)], executionAuthorized: false }
}

/** Host-scoped grant is created only after separate authentication and policy checks. */
export type WorkflowExecutionGrant = Readonly<{
  workflowId: string
  version: number
  allowedCapabilities: readonly string[]
  approvedStepIds: readonly string[]
}>
export type WorkflowStepReceipt = Readonly<{
  id: string
  capability: string
  evidenceId: string
}>
export type WorkflowRunResult = Readonly<{
  status: 'completed' | 'blocked'
  receipts: readonly WorkflowStepReceipt[]
  blockedStep?: string
  reason?: string
}>
export type WorkflowCapabilityHandler = (step: DynamicWorkflowDefinition['steps'][number], prior: readonly WorkflowStepReceipt[]) => Promise<string>

/**
 * Executes only host-registered handlers explicitly granted for this workflow
 * version and approved for each step. No dynamic JS is evaluated. Fail closed
 * before any action on missing dependencies, invalid graphs or approval.
 * Idempotency across crashes remains the responsibility of capability handlers.
 */
export async function executeDynamicWorkflow(
  definition: DynamicWorkflowDefinition,
  registeredHandlers: Readonly<Record<string, WorkflowCapabilityHandler>>,
  grant: WorkflowExecutionGrant | null,
): Promise<WorkflowRunResult> {
  const validation=validateDynamicWorkflow(definition,Object.keys(registeredHandlers))
  if (!validation.valid) return {status:'blocked',receipts:[],reason:'invalid_definition'}
  if (!grant || grant.workflowId!==definition.id || grant.version!==definition.version) {
    return {status:'blocked',receipts:[],reason:'missing_or_stale_grant'}
  }
  const receipts: WorkflowStepReceipt[]=[]
  const remaining=new Map(definition.steps.map(step=>[step.id,step]))
  while (remaining.size>0) {
    const ready=[...remaining.values()].find(step=>step.dependsOn.every(dep=>receipts.some(r=>r.id===dep)))
    if (!ready) return {status:'blocked',receipts,reason:'unsatisfied_dependencies'}
    if (!grant.allowedCapabilities.includes(ready.capability) || (ready.requiresApproval && !grant.approvedStepIds.includes(ready.id))) {
      return {status:'blocked',receipts,blockedStep:ready.id,reason:'authorization_required'}
    }
    try {
      const evidenceId=await registeredHandlers[ready.capability](ready,receipts)
      if (!evidenceId?.trim()) return {status:'blocked',receipts,blockedStep:ready.id,reason:'missing_host_receipt'}
      receipts.push({id:ready.id,capability:ready.capability,evidenceId})
      remaining.delete(ready.id)
    } catch {
      return {status:'blocked',receipts,blockedStep:ready.id,reason:'handler_failed'}
    }
  }
  return {status:'completed',receipts}
}
