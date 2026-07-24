import type { TenantContext } from './types.ts';
import type { EnterpriseHumanReviewDecisionLedgerSnapshot } from './human-review-decision-ledger.ts';

export const EAE_HUMAN_REVIEW_OUTCOME_SCHEMA_VERSION = '1.0.0' as const;
export type HumanReviewOutcomeDisposition = 'complete' | 'needs_evidence' | 'blocked' | 'invalid' | 'empty';

export interface EnterpriseHumanReviewOutcomeRequest {
  readonly tenant: TenantContext;
  readonly ledger: EnterpriseHumanReviewDecisionLedgerSnapshot;
  readonly maxItems: number;
}

export interface EnterpriseHumanReviewOutcomeItem {
  readonly proposalId: string;
  readonly decision: 'approve' | 'reject' | 'request_evidence' | 'defer';
  readonly reviewerIds: readonly string[];
  readonly ledgerEntryIds: readonly string[];
  readonly reasons: readonly string[];
  readonly valid: boolean;
  readonly evidenceRefs: readonly string[];
  readonly executable: false;
}

export interface EnterpriseHumanReviewOutcomeSnapshot {
  readonly schemaVersion: typeof EAE_HUMAN_REVIEW_OUTCOME_SCHEMA_VERSION;
  readonly outcomeId: string;
  readonly tenant: TenantContext;
  readonly ledgerId: string;
  readonly disposition: HumanReviewOutcomeDisposition;
  readonly readOnly: true;
  readonly executable: false;
  readonly approvedProposalIds: readonly string[];
  readonly rejectedProposalIds: readonly string[];
  readonly evidenceRequestedProposalIds: readonly string[];
  readonly deferredProposalIds: readonly string[];
  readonly items: readonly EnterpriseHumanReviewOutcomeItem[];
  readonly evidenceRefs: readonly string[];
  readonly truncated: boolean;
}

function tenantKey(t: TenantContext): string { return `${t.tenantId}:${t.environmentId}`; }
function canonical(v: unknown): string { if(Array.isArray(v)) return `[${v.map(canonical).join(',')}]`; if(v&&typeof v==='object') return `{${Object.entries(v as Record<string,unknown>).sort(([a],[b])=>a.localeCompare(b)).map(([k,x])=>`${JSON.stringify(k)}:${canonical(x)}`).join(',')}}`; const x=JSON.stringify(v); if(x===undefined) throw new Error('non_json_value_rejected'); return x; }
function hash(v: unknown): string { let h=2166136261; for(const c of canonical(v)){ h^=c.charCodeAt(0); h=Math.imul(h,16777619); } return (h>>>0).toString(16).padStart(8,'0'); }
function freeze<T>(v:T):T { if(!v||typeof v!=='object'||Object.isFrozen(v)) return v; Object.freeze(v); for(const x of Object.values(v as Record<string,unknown>)) freeze(x); return v; }

export function composeEnterpriseHumanReviewOutcome(request: EnterpriseHumanReviewOutcomeRequest): EnterpriseHumanReviewOutcomeSnapshot {
  if(!request.tenant.tenantId||!request.tenant.environmentId) throw new Error('tenant_required');
  if(tenantKey(request.ledger.tenant)!==tenantKey(request.tenant)) throw new Error('decision_ledger_tenant_boundary_violation');
  if(request.ledger.executable!==false||request.ledger.readOnly!==true) throw new Error('unsafe_decision_ledger_rejected');
  if(!Number.isInteger(request.maxItems)||request.maxItems<1||request.maxItems>512) throw new Error('unbounded_review_outcome_rejected');
  const grouped=new Map<string,typeof request.ledger.entries>();
  for(const entry of request.ledger.entries) grouped.set(entry.proposalId,[...(grouped.get(entry.proposalId)??[]),entry]);
  const candidates=[...grouped.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([proposalId,entries])=>{
    const ordered=[...entries].sort((a,b)=>a.entryId.localeCompare(b.entryId));
    const decisions=[...new Set(ordered.map(entry=>entry.decision))];
    const decision=decisions.length===1?decisions[0]:'request_evidence';
    return {proposalId,decision,reviewerIds:[...new Set(ordered.map(entry=>entry.reviewerId))].sort(),ledgerEntryIds:ordered.map(entry=>entry.entryId),reasons:[...new Set(ordered.map(entry=>entry.reason))].sort(),valid:ordered.every(entry=>entry.valid)&&decisions.length===1,evidenceRefs:[...new Set(ordered.flatMap(entry=>entry.evidenceRefs))].sort(),executable:false as const};
  });
  const items=candidates.slice(0,request.maxItems);
  let disposition:HumanReviewOutcomeDisposition=request.ledger.disposition;
  if(candidates.length===0) disposition='empty'; else if(items.some(item=>!item.valid)&&disposition==='complete') disposition='invalid';
  const approvedProposalIds=items.filter(item=>item.valid&&item.decision==='approve').map(item=>item.proposalId);
  const rejectedProposalIds=items.filter(item=>item.valid&&item.decision==='reject').map(item=>item.proposalId);
  const evidenceRequestedProposalIds=items.filter(item=>item.decision==='request_evidence'||!item.valid).map(item=>item.proposalId);
  const deferredProposalIds=items.filter(item=>item.valid&&item.decision==='defer').map(item=>item.proposalId);
  const base={schemaVersion:EAE_HUMAN_REVIEW_OUTCOME_SCHEMA_VERSION,tenant:request.tenant,ledgerId:request.ledger.ledgerId,disposition,readOnly:true as const,executable:false as const,approvedProposalIds,rejectedProposalIds,evidenceRequestedProposalIds,deferredProposalIds,items,evidenceRefs:[...new Set([...request.ledger.evidenceRefs,...items.flatMap(item=>item.evidenceRefs)])].sort(),truncated:candidates.length>request.maxItems};
  return freeze({...base,outcomeId:`eae_human_review_outcome_${hash(base)}`});
}
