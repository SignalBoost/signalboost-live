import type { TenantContext } from './types.ts';
import type { EnterpriseExecutionPlanSnapshot } from './execution-planner.ts';

export const EAE_EXECUTION_AUTHORIZATION_SCHEMA_VERSION = '1.0.0' as const;
export type AuthorizationStatus = 'ready_for_authorization' | 'approval_required' | 'escalation_required' | 'blocked';

export interface ApprovalAttestation {
  readonly approvalId: string;
  readonly tenant: TenantContext;
  readonly planId: string;
  readonly stepId: string;
  readonly approverRole: string;
  readonly approved: boolean;
  readonly evidenceRefs: readonly string[];
}

export interface ExecutionAuthorizationRequest {
  readonly tenant: TenantContext;
  readonly plan: EnterpriseExecutionPlanSnapshot;
  readonly approvals: readonly ApprovalAttestation[];
  readonly policyValid: boolean;
  readonly capabilitiesAvailable: boolean;
  readonly environmentReady: boolean;
  readonly maxApprovals: number;
}

export interface EnterpriseExecutionAuthorizationSnapshot {
  readonly schemaVersion: typeof EAE_EXECUTION_AUTHORIZATION_SCHEMA_VERSION;
  readonly authorizationId: string;
  readonly tenant: TenantContext;
  readonly planId: string;
  readonly status: AuthorizationStatus;
  readonly executable: false;
  readonly externallyAuthorizable: boolean;
  readonly satisfiedApprovalStepIds: readonly string[];
  readonly missingApprovalStepIds: readonly string[];
  readonly reasons: readonly string[];
  readonly evidenceRefs: readonly string[];
  readonly truncated: boolean;
}

function tenantKey(t: TenantContext): string { return `${t.tenantId}:${t.environmentId}`; }
function canonical(v: unknown): string { if(Array.isArray(v)) return `[${v.map(canonical).join(',')}]`; if(v&&typeof v==='object') return `{${Object.entries(v as Record<string,unknown>).sort(([a],[b])=>a.localeCompare(b)).map(([k,x])=>`${JSON.stringify(k)}:${canonical(x)}`).join(',')}}`; const x=JSON.stringify(v); if(x===undefined) throw new Error('non_json_value_rejected'); return x; }
function hash(v: unknown): string { let h=2166136261; for(const c of canonical(v)){ h^=c.charCodeAt(0); h=Math.imul(h,16777619); } return (h>>>0).toString(16).padStart(8,'0'); }
function freeze<T>(v:T):T { if(!v||typeof v!=='object'||Object.isFrozen(v)) return v; Object.freeze(v); for(const x of Object.values(v as Record<string,unknown>)) freeze(x); return v; }

export function evaluateEnterpriseExecutionAuthorization(request: ExecutionAuthorizationRequest): EnterpriseExecutionAuthorizationSnapshot {
  if(!request.tenant.tenantId||!request.tenant.environmentId) throw new Error('tenant_required');
  if(tenantKey(request.plan.tenant)!==tenantKey(request.tenant)) throw new Error('plan_tenant_boundary_violation');
  if(request.plan.executable!==false) throw new Error('executable_plan_rejected');
  if(!Number.isInteger(request.maxApprovals)||request.maxApprovals<1||request.maxApprovals>256) throw new Error('unbounded_authorization_request_rejected');
  const ids=new Set<string>();
  for(const approval of request.approvals){
    if(tenantKey(approval.tenant)!==tenantKey(request.tenant)) throw new Error('tenant_environment_boundary_violation');
    if(approval.planId!==request.plan.planId) throw new Error('approval_plan_mismatch');
    if(!approval.approvalId||!approval.stepId||!approval.approverRole) throw new Error('invalid_approval_attestation');
    if(ids.has(approval.approvalId)) throw new Error('duplicate_approval_id'); ids.add(approval.approvalId);
  }
  const limited=[...request.approvals].sort((a,b)=>a.approvalId.localeCompare(b.approvalId)).slice(0,request.maxApprovals);
  const required=new Set(request.plan.approvalStepIds);
  const satisfied=[...new Set(limited.filter(a=>a.approved&&required.has(a.stepId)).map(a=>a.stepId))].sort();
  const missing=[...required].filter(id=>!satisfied.includes(id)).sort();
  const reasons:string[]=[]; let status:AuthorizationStatus='ready_for_authorization';
  if(request.plan.disposition==='block'){ status='blocked'; reasons.push('decision_blocked'); }
  else if(!request.policyValid){ status='blocked'; reasons.push('policy_invalid'); }
  else if(!request.capabilitiesAvailable){ status='blocked'; reasons.push('capability_unavailable'); }
  else if(!request.environmentReady){ status='blocked'; reasons.push('environment_not_ready'); }
  else if(request.plan.disposition==='escalate'){ status='escalation_required'; reasons.push('decision_escalation_required'); }
  else if(missing.length){ status='approval_required'; reasons.push('required_approval_missing'); }
  else reasons.push('all_preconditions_satisfied');
  const base={schemaVersion:EAE_EXECUTION_AUTHORIZATION_SCHEMA_VERSION,tenant:request.tenant,planId:request.plan.planId,status,executable:false as const,externallyAuthorizable:status==='ready_for_authorization',satisfiedApprovalStepIds:satisfied,missingApprovalStepIds:missing,reasons,evidenceRefs:[...new Set([...request.plan.evidenceRefs,...limited.flatMap(a=>a.evidenceRefs)])].sort(),truncated:request.approvals.length>request.maxApprovals};
  return freeze({...base,authorizationId:`eae_execution_authorization_${hash(base)}`});
}
