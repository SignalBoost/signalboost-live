import { freezeAgentWorkflowState, isTerminalWorkflowStatus, type AgentWorkflowState } from './workflow-state.ts'
import type { AgentWorkflowStore } from './workflow-store.ts'
export class InMemoryAgentWorkflowStore implements AgentWorkflowStore {
  private readonly records = new Map<string, AgentWorkflowState>(); private readonly keys = new Map<string,string>()
  constructor(private readonly maximumRecords = 1000) {}
  async create(state: AgentWorkflowState) { if (this.records.has(state.workflowId)) throw new Error('duplicate_workflow'); const key=`${state.userId}:${state.idempotencyKey}`; if(this.keys.has(key)) throw new Error('duplicate_idempotency_key'); if(this.records.size>=this.maximumRecords) throw new Error('operation_failed'); const value=freezeAgentWorkflowState(state); this.records.set(value.workflowId,value); this.keys.set(key,value.workflowId); return value }
  async get(id:string) { return this.records.get(id) ?? null }
  async getByIdempotencyKey(userId:string,key:string) { const id=this.keys.get(`${userId}:${key}`); return id ? this.records.get(id) ?? null : null }
  async compareAndSet(input: { workflowId:string; expectedVersion:number; next:AgentWorkflowState; expectedLeaseOwner?:string|null; expectedLeaseToken?:string|null }) { const current=this.records.get(input.workflowId); if(!current || current.version!==input.expectedVersion || input.next.version!==input.expectedVersion+1 || (input.expectedLeaseOwner !== undefined && current.leaseOwner !== input.expectedLeaseOwner) || (input.expectedLeaseToken !== undefined && current.leaseToken !== input.expectedLeaseToken)) return null; const next=freezeAgentWorkflowState(input.next); this.records.set(next.workflowId,next); return next }
  async listRecoverable({now,limit}:{now:number;limit:number}) { return Object.freeze([...this.records.values()].filter(x => x.cancellationRequested || (x.leaseExpiresAt !== null && Date.parse(x.leaseExpiresAt)<=now && !isTerminalWorkflowStatus(x.status)) || (isTerminalWorkflowStatus(x.status)&&!x.quotaReleased)).sort((a,b)=>a.updatedAt.localeCompare(b.updatedAt)||a.workflowId.localeCompare(b.workflowId)).slice(0,limit)) }
}
