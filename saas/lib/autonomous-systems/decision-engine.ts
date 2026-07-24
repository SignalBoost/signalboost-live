import type { RiskLevel, TenantContext } from './types.ts';

export const EAE_DECISION_SCHEMA_VERSION = '1.0.0' as const;
export type DecisionDisposition = 'proceed' | 'require_review' | 'block' | 'escalate';

export interface DecisionCandidate {
  readonly candidateId: string;
  readonly tenant: TenantContext;
  readonly objectiveId: string;
  readonly objectivePriority: number;
  readonly capabilityId: string;
  readonly capabilityStatus: 'available' | 'degraded' | 'disabled';
  readonly policyEffect: 'allow' | 'deny' | 'require_review' | 'escalate';
  readonly riskLevel: RiskLevel;
  readonly evidenceRefs: readonly string[];
}

export interface DecisionRequest {
  readonly tenant: TenantContext;
  readonly candidates: readonly DecisionCandidate[];
  readonly maxCandidates: number;
}

export interface EnterpriseDecisionSnapshot {
  readonly schemaVersion: typeof EAE_DECISION_SCHEMA_VERSION;
  readonly decisionId: string;
  readonly tenant: TenantContext;
  readonly selectedCandidateId?: string;
  readonly rankedCandidateIds: readonly string[];
  readonly disposition: DecisionDisposition;
  readonly reasons: readonly string[];
  readonly evidenceRefs: readonly string[];
  readonly truncated: boolean;
}

const riskWeight: Readonly<Record<RiskLevel, number>> = { low: 0, medium: 10, high: 20, critical: 30 };
function tenantKey(t: TenantContext): string { return `${t.tenantId}:${t.environmentId}`; }
function canonical(v: unknown): string { if(Array.isArray(v)) return `[${v.map(canonical).join(',')}]`; if(v&&typeof v==='object') return `{${Object.entries(v as Record<string,unknown>).sort(([a],[b])=>a.localeCompare(b)).map(([k,x])=>`${JSON.stringify(k)}:${canonical(x)}`).join(',')}}`; const x=JSON.stringify(v); if(x===undefined) throw new Error('non_json_value_rejected'); return x; }
function hash(v: unknown): string { let h=2166136261; for(const c of canonical(v)){ h^=c.charCodeAt(0); h=Math.imul(h,16777619); } return (h>>>0).toString(16).padStart(8,'0'); }
function freeze<T>(v:T):T { if(!v||typeof v!=='object'||Object.isFrozen(v)) return v; Object.freeze(v); for(const x of Object.values(v as Record<string,unknown>)) freeze(x); return v; }
function score(c: DecisionCandidate): number { const capabilityPenalty=c.capabilityStatus==='available'?0:c.capabilityStatus==='degraded'?25:1000; const policyPenalty=c.policyEffect==='allow'?0:c.policyEffect==='require_review'?50:c.policyEffect==='escalate'?500:1000; return c.objectivePriority*100-capabilityPenalty-policyPenalty-riskWeight[c.riskLevel]; }

export function buildEnterpriseDecision(request: DecisionRequest): EnterpriseDecisionSnapshot {
  if(!request.tenant.tenantId||!request.tenant.environmentId) throw new Error('tenant_required');
  if(!Number.isInteger(request.maxCandidates)||request.maxCandidates<1||request.maxCandidates>256) throw new Error('unbounded_decision_request_rejected');
  const ids=new Set<string>();
  for(const c of request.candidates){
    if(tenantKey(c.tenant)!==tenantKey(request.tenant)) throw new Error('tenant_environment_boundary_violation');
    if(!c.candidateId||!c.objectiveId||!c.capabilityId||!Number.isInteger(c.objectivePriority)||c.objectivePriority<0||c.objectivePriority>10000) throw new Error('invalid_candidate');
    if(ids.has(c.candidateId)) throw new Error('duplicate_candidate_id'); ids.add(c.candidateId);
  }
  const ranked=[...request.candidates].sort((a,b)=>score(b)-score(a)||a.candidateId.localeCompare(b.candidateId));
  const selected=ranked.find(c=>c.capabilityStatus!=='disabled'&&c.policyEffect!=='deny');
  const limited=ranked.slice(0,request.maxCandidates);
  let disposition:DecisionDisposition='block'; const reasons:string[]=[];
  if(!selected) reasons.push('no_eligible_candidate');
  else if(selected.policyEffect==='escalate'){ disposition='escalate'; reasons.push('policy_escalation'); }
  else if(selected.policyEffect==='require_review'||selected.capabilityStatus==='degraded'){ disposition='require_review'; reasons.push(selected.policyEffect==='require_review'?'policy_review_required':'capability_degraded'); }
  else { disposition='proceed'; reasons.push('highest_ranked_eligible_candidate'); }
  const base={schemaVersion:EAE_DECISION_SCHEMA_VERSION,tenant:request.tenant,selectedCandidateId:selected?.candidateId,rankedCandidateIds:limited.map(c=>c.candidateId),disposition,reasons,evidenceRefs:[...new Set(limited.flatMap(c=>c.evidenceRefs))].sort(),truncated:ranked.length>request.maxCandidates};
  return freeze({...base,decisionId:`eae_decision_${hash(base)}`});
}
