import type { TenantContext } from './types.ts';
import type { EnterpriseExecutionPlanSnapshot, PlannedExecutionStep } from './execution-planner.ts';
import type { EnterpriseExecutionAuthorizationSnapshot } from './execution-authorization-gate.ts';

export const EAE_EXECUTION_SIMULATION_SCHEMA_VERSION = '1.0.0' as const;
export type SimulatedStepState = 'simulated_success' | 'simulated_rollback' | 'waiting_for_approval' | 'blocked' | 'skipped';
export type SimulationStatus = 'simulated_complete' | 'simulated_with_rollback' | 'waiting_for_approval' | 'blocked';

export interface ExecutionSimulationRequest {
  readonly tenant: TenantContext;
  readonly plan: EnterpriseExecutionPlanSnapshot;
  readonly authorization: EnterpriseExecutionAuthorizationSnapshot;
  readonly simulatedFailureStepIds: readonly string[];
  readonly maxTransitions: number;
}

export interface SimulatedExecutionTransition {
  readonly ordinal: number;
  readonly stepId: string;
  readonly state: SimulatedStepState;
  readonly reason: string;
  readonly rollbackAction?: string;
  readonly contingencyAction?: string;
  readonly evidenceRefs: readonly string[];
}

export interface EnterpriseExecutionSimulationSnapshot {
  readonly schemaVersion: typeof EAE_EXECUTION_SIMULATION_SCHEMA_VERSION;
  readonly simulationId: string;
  readonly tenant: TenantContext;
  readonly planId: string;
  readonly authorizationId: string;
  readonly status: SimulationStatus;
  readonly executable: false;
  readonly transitions: readonly SimulatedExecutionTransition[];
  readonly completedStepIds: readonly string[];
  readonly rolledBackStepIds: readonly string[];
  readonly blockedStepIds: readonly string[];
  readonly evidenceRefs: readonly string[];
  readonly truncated: boolean;
}

function tenantKey(t: TenantContext): string { return `${t.tenantId}:${t.environmentId}`; }
function canonical(v: unknown): string { if(Array.isArray(v)) return `[${v.map(canonical).join(',')}]`; if(v&&typeof v==='object') return `{${Object.entries(v as Record<string,unknown>).sort(([a],[b])=>a.localeCompare(b)).map(([k,x])=>`${JSON.stringify(k)}:${canonical(x)}`).join(',')}}`; const x=JSON.stringify(v); if(x===undefined) throw new Error('non_json_value_rejected'); return x; }
function hash(v: unknown): string { let h=2166136261; for(const c of canonical(v)){ h^=c.charCodeAt(0); h=Math.imul(h,16777619); } return (h>>>0).toString(16).padStart(8,'0'); }
function freeze<T>(v:T):T { if(!v||typeof v!=='object'||Object.isFrozen(v)) return v; Object.freeze(v); for(const x of Object.values(v as Record<string,unknown>)) freeze(x); return v; }

export function simulateEnterpriseExecution(request: ExecutionSimulationRequest): EnterpriseExecutionSimulationSnapshot {
  if(!request.tenant.tenantId||!request.tenant.environmentId) throw new Error('tenant_required');
  if(tenantKey(request.plan.tenant)!==tenantKey(request.tenant)) throw new Error('plan_tenant_boundary_violation');
  if(tenantKey(request.authorization.tenant)!==tenantKey(request.tenant)) throw new Error('authorization_tenant_boundary_violation');
  if(request.authorization.planId!==request.plan.planId) throw new Error('authorization_plan_mismatch');
  if(request.plan.executable!==false||request.authorization.executable!==false) throw new Error('executable_input_rejected');
  if(!Number.isInteger(request.maxTransitions)||request.maxTransitions<1||request.maxTransitions>512) throw new Error('unbounded_simulation_rejected');
  const stepIds=new Set(request.plan.steps.map(step=>step.stepId));
  const failures=new Set<string>();
  for(const id of request.simulatedFailureStepIds){ if(!stepIds.has(id)) throw new Error('unknown_simulated_failure_step'); if(failures.has(id)) throw new Error('duplicate_simulated_failure_step'); failures.add(id); }
  const transitions:SimulatedExecutionTransition[]=[]; const completed=new Set<string>(); const rolledBack=new Set<string>(); const blocked=new Set<string>();
  let status:SimulationStatus='simulated_complete';
  const append=(step:PlannedExecutionStep,state:SimulatedStepState,reason:string):void=>{ transitions.push({ordinal:transitions.length+1,stepId:step.stepId,state,reason,rollbackAction:step.rollbackAction,contingencyAction:step.contingencyAction,evidenceRefs:[...new Set(step.evidenceRefs)].sort()}); };
  for(const step of request.plan.steps){
    if(transitions.length>=request.maxTransitions) break;
    if(request.authorization.status==='blocked'||request.authorization.status==='escalation_required'){ append(step,'blocked',request.authorization.status); blocked.add(step.stepId); status='blocked'; continue; }
    if(request.authorization.status==='approval_required'&&request.authorization.missingApprovalStepIds.includes(step.stepId)){ append(step,'waiting_for_approval','required_approval_missing'); blocked.add(step.stepId); status='waiting_for_approval'; continue; }
    if(step.dependsOn.some(id=>!completed.has(id))){ append(step,'skipped','dependency_not_simulated_successfully'); blocked.add(step.stepId); if(status==='simulated_complete') status='blocked'; continue; }
    if(failures.has(step.stepId)){
      if(step.rollbackAction){ append(step,'simulated_rollback','simulated_failure_with_rollback'); rolledBack.add(step.stepId); status='simulated_with_rollback'; }
      else { append(step,'blocked','simulated_failure_without_rollback'); blocked.add(step.stepId); status='blocked'; }
      continue;
    }
    append(step,'simulated_success','simulation_only_transition'); completed.add(step.stepId);
  }
  const limited=transitions.slice(0,request.maxTransitions);
  const base={schemaVersion:EAE_EXECUTION_SIMULATION_SCHEMA_VERSION,tenant:request.tenant,planId:request.plan.planId,authorizationId:request.authorization.authorizationId,status,executable:false as const,transitions:limited,completedStepIds:[...completed].sort(),rolledBackStepIds:[...rolledBack].sort(),blockedStepIds:[...blocked].sort(),evidenceRefs:[...new Set([...request.plan.evidenceRefs,...request.authorization.evidenceRefs,...limited.flatMap(t=>t.evidenceRefs)])].sort(),truncated:request.plan.steps.length>request.maxTransitions};
  return freeze({...base,simulationId:`eae_execution_simulation_${hash(base)}`});
}
