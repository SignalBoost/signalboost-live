import type { RiskLevel, TenantContext } from './types.ts';
import type { DecisionDisposition, EnterpriseDecisionSnapshot } from './decision-engine.ts';

export const EAE_EXECUTION_PLAN_SCHEMA_VERSION = '1.0.0' as const;
export type ExecutionGate = 'none' | 'human_review' | 'escalation' | 'blocked';

export interface ExecutionStepCandidate {
  readonly stepId: string;
  readonly tenant: TenantContext;
  readonly candidateId: string;
  readonly capabilityId: string;
  readonly action: string;
  readonly dependsOn: readonly string[];
  readonly riskLevel: RiskLevel;
  readonly requiresHumanApproval: boolean;
  readonly rollbackAction?: string;
  readonly contingencyAction?: string;
  readonly evidenceRefs: readonly string[];
}

export interface ExecutionPlanRequest {
  readonly tenant: TenantContext;
  readonly decision: EnterpriseDecisionSnapshot;
  readonly steps: readonly ExecutionStepCandidate[];
  readonly maxSteps: number;
  readonly maxDepth: number;
}

export interface PlannedExecutionStep extends ExecutionStepCandidate {
  readonly ordinal: number;
  readonly gate: ExecutionGate;
}

export interface EnterpriseExecutionPlanSnapshot {
  readonly schemaVersion: typeof EAE_EXECUTION_PLAN_SCHEMA_VERSION;
  readonly planId: string;
  readonly tenant: TenantContext;
  readonly decisionId: string;
  readonly disposition: DecisionDisposition;
  readonly executable: false;
  readonly steps: readonly PlannedExecutionStep[];
  readonly approvalStepIds: readonly string[];
  readonly rollbackStepIds: readonly string[];
  readonly contingencyStepIds: readonly string[];
  readonly evidenceRefs: readonly string[];
  readonly truncated: boolean;
}

function tenantKey(t: TenantContext): string { return `${t.tenantId}:${t.environmentId}`; }
function canonical(v: unknown): string { if(Array.isArray(v)) return `[${v.map(canonical).join(',')}]`; if(v&&typeof v==='object') return `{${Object.entries(v as Record<string,unknown>).sort(([a],[b])=>a.localeCompare(b)).map(([k,x])=>`${JSON.stringify(k)}:${canonical(x)}`).join(',')}}`; const x=JSON.stringify(v); if(x===undefined) throw new Error('non_json_value_rejected'); return x; }
function hash(v: unknown): string { let h=2166136261; for(const c of canonical(v)){ h^=c.charCodeAt(0); h=Math.imul(h,16777619); } return (h>>>0).toString(16).padStart(8,'0'); }
function freeze<T>(v:T):T { if(!v||typeof v!=='object'||Object.isFrozen(v)) return v; Object.freeze(v); for(const x of Object.values(v as Record<string,unknown>)) freeze(x); return v; }

export function buildEnterpriseExecutionPlan(request: ExecutionPlanRequest): EnterpriseExecutionPlanSnapshot {
  if(!request.tenant.tenantId||!request.tenant.environmentId) throw new Error('tenant_required');
  if(tenantKey(request.decision.tenant)!==tenantKey(request.tenant)) throw new Error('decision_tenant_boundary_violation');
  if(!Number.isInteger(request.maxSteps)||request.maxSteps<1||request.maxSteps>256) throw new Error('unbounded_execution_plan_rejected');
  if(!Number.isInteger(request.maxDepth)||request.maxDepth<1||request.maxDepth>32) throw new Error('unbounded_execution_depth_rejected');
  const ids=new Set<string>();
  for(const step of request.steps){
    if(tenantKey(step.tenant)!==tenantKey(request.tenant)) throw new Error('tenant_environment_boundary_violation');
    if(!step.stepId||!step.candidateId||!step.capabilityId||!step.action) throw new Error('invalid_execution_step');
    if(ids.has(step.stepId)) throw new Error('duplicate_execution_step_id'); ids.add(step.stepId);
    if(step.dependsOn.includes(step.stepId)||new Set(step.dependsOn).size!==step.dependsOn.length) throw new Error('invalid_execution_dependency');
  }
  for(const step of request.steps) for(const dependency of step.dependsOn) if(!ids.has(dependency)) throw new Error('missing_execution_dependency');
  const selected=request.decision.selectedCandidateId;
  const eligible=request.steps.filter(step=>selected&&step.candidateId===selected).sort((a,b)=>a.stepId.localeCompare(b.stepId));
  const visiting=new Set<string>(); const visited=new Set<string>(); const ordered:ExecutionStepCandidate[]=[];
  const byId=new Map(eligible.map(step=>[step.stepId,step]));
  function visit(step:ExecutionStepCandidate,depth:number):void { if(depth>request.maxDepth) throw new Error('execution_plan_depth_exceeded'); if(visited.has(step.stepId)) return; if(visiting.has(step.stepId)) throw new Error('circular_execution_dependency'); visiting.add(step.stepId); for(const id of [...step.dependsOn].sort()){ const dependency=byId.get(id); if(!dependency) throw new Error('cross_candidate_dependency_rejected'); visit(dependency,depth+1); } visiting.delete(step.stepId); visited.add(step.stepId); ordered.push(step); }
  for(const step of eligible) visit(step,1);
  const limited=ordered.slice(0,request.maxSteps);
  const gate:ExecutionGate=request.decision.disposition==='block'?'blocked':request.decision.disposition==='escalate'?'escalation':request.decision.disposition==='require_review'?'human_review':'none';
  const planned=limited.map((step,index)=>({...step,dependsOn:[...step.dependsOn].sort(),evidenceRefs:[...new Set(step.evidenceRefs)].sort(),ordinal:index+1,gate:step.requiresHumanApproval&&gate==='none'?'human_review':gate}));
  const base={schemaVersion:EAE_EXECUTION_PLAN_SCHEMA_VERSION,tenant:request.tenant,decisionId:request.decision.decisionId,disposition:request.decision.disposition,executable:false as const,steps:planned,approvalStepIds:planned.filter(s=>s.gate!=='none').map(s=>s.stepId),rollbackStepIds:planned.filter(s=>Boolean(s.rollbackAction)).map(s=>s.stepId),contingencyStepIds:planned.filter(s=>Boolean(s.contingencyAction)).map(s=>s.stepId),evidenceRefs:[...new Set([...request.decision.evidenceRefs,...planned.flatMap(s=>s.evidenceRefs)])].sort(),truncated:ordered.length>request.maxSteps};
  return freeze({...base,planId:`eae_execution_plan_${hash(base)}`});
}
