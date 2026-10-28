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
