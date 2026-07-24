import type { TenantContext } from './types.ts';
import type { EnterpriseHumanReviewQueueSnapshot } from './human-review-queue-engine.ts';

export const EAE_HUMAN_REVIEW_DECISION_SCHEMA_VERSION = '1.0.0' as const;
export type HumanReviewDecision = 'approve' | 'reject' | 'request_evidence' | 'defer';
export type HumanReviewDecisionDisposition = 'valid' | 'needs_evidence' | 'blocked';

export interface HumanReviewDecisionAttestation {
  readonly queueItemId: string;
  readonly proposalId: string;
  readonly reviewerId: string;
  readonly decision: HumanReviewDecision;
  readonly reason: string;
  readonly evidenceRefs: readonly string[];
}

export interface EnterpriseHumanReviewDecisionRequest {
  readonly tenant: TenantContext;
  readonly queue: EnterpriseHumanReviewQueueSnapshot;
  readonly attestations: readonly HumanReviewDecisionAttestation[];
  readonly maxDecisions: number;
}

export interface ValidatedHumanReviewDecision {
  readonly decisionId: string;
  readonly queueItemId: string;
  readonly proposalId: string;
  readonly reviewerId: string;
  readonly decision: HumanReviewDecision;
  readonly reason: string;
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly evidenceRefs: readonly string[];
  readonly executable: false;
}

export interface EnterpriseHumanReviewDecisionSnapshot {
  readonly schemaVersion: typeof EAE_HUMAN_REVIEW_DECISION_SCHEMA_VERSION;
  readonly decisionSetId: string;
  readonly tenant: TenantContext;
  readonly queueId: string;
  readonly disposition: HumanReviewDecisionDisposition;
  readonly readOnly: true;
  readonly executable: false;
  readonly decisions: readonly ValidatedHumanReviewDecision[];
  readonly evidenceRefs: readonly string[];
  readonly truncated: boolean;
}

function tenantKey(t: TenantContext): string { return `${t.tenantId}:${t.environmentId}`; }
function canonical(v: unknown): string { if(Array.isArray(v)) return `[${v.map(canonical).join(',')}]`; if(v&&typeof v==='object') return `{${Object.entries(v as Record<string,unknown>).sort(([a],[b])=>a.localeCompare(b)).map(([k,x])=>`${JSON.stringify(k)}:${canonical(x)}`).join(',')}}`; const x=JSON.stringify(v); if(x===undefined) throw new Error('non_json_value_rejected'); return x; }
function hash(v: unknown): string { let h=2166136261; for(const c of canonical(v)){ h^=c.charCodeAt(0); h=Math.imul(h,16777619); } return (h>>>0).toString(16).padStart(8,'0'); }
function freeze<T>(v:T):T { if(!v||typeof v!=='object'||Object.isFrozen(v)) return v; Object.freeze(v); for(const x of Object.values(v as Record<string,unknown>)) freeze(x); return v; }

export function validateEnterpriseHumanReviewDecisions(request: EnterpriseHumanReviewDecisionRequest): EnterpriseHumanReviewDecisionSnapshot {
  if(!request.tenant.tenantId||!request.tenant.environmentId) throw new Error('tenant_required');
  if(tenantKey(request.queue.tenant)!==tenantKey(request.tenant)) throw new Error('review_queue_tenant_boundary_violation');
  if(request.queue.executable!==false||request.queue.readOnly!==true) throw new Error('unsafe_review_queue_rejected');
  if(!Number.isInteger(request.maxDecisions)||request.maxDecisions<1||request.maxDecisions>256) throw new Error('unbounded_review_decisions_rejected');
  const itemById=new Map(request.queue.items.map(item=>[item.queueItemId,item]));
  const seen=new Set<string>();
  const ordered=[...request.attestations].sort((a,b)=>a.queueItemId.localeCompare(b.queueItemId)||a.reviewerId.localeCompare(b.reviewerId));
  const decisions=ordered.slice(0,request.maxDecisions).map(attestation=>{
    const errors:string[]=[];
    const duplicateKey=`${attestation.queueItemId}:${attestation.reviewerId}`;
    const item=itemById.get(attestation.queueItemId);
    if(seen.has(duplicateKey)) errors.push('duplicate_reviewer_attestation'); else seen.add(duplicateKey);
    if(!item) errors.push('unknown_queue_item');
    if(item&&item.proposalId!==attestation.proposalId) errors.push('proposal_id_mismatch');
    if(!attestation.reviewerId.trim()) errors.push('reviewer_id_required');
    if(!attestation.reason.trim()) errors.push('decision_reason_required');
    if(request.queue.disposition==='blocked'&&attestation.decision==='approve') errors.push('blocked_queue_cannot_approve');
    if(request.queue.disposition==='needs_evidence'&&attestation.decision==='approve') errors.push('evidence_required_before_approval');
    const base={queueItemId:attestation.queueItemId,proposalId:attestation.proposalId,reviewerId:attestation.reviewerId,decision:attestation.decision,reason:attestation.reason,valid:errors.length===0,errors:[...errors].sort(),evidenceRefs:[...new Set(attestation.evidenceRefs)].sort(),executable:false as const};
    return {...base,decisionId:`eae_human_review_decision_${hash(base)}`};
  });
  let disposition:HumanReviewDecisionDisposition='valid';
  if(request.queue.disposition==='blocked'||decisions.some(decision=>decision.errors.includes('blocked_queue_cannot_approve'))) disposition='blocked';
  else if(request.queue.disposition==='needs_evidence'||decisions.some(decision=>decision.decision==='request_evidence'||decision.errors.includes('evidence_required_before_approval'))) disposition='needs_evidence';
  const base={schemaVersion:EAE_HUMAN_REVIEW_DECISION_SCHEMA_VERSION,tenant:request.tenant,queueId:request.queue.queueId,disposition,readOnly:true as const,executable:false as const,decisions,evidenceRefs:[...new Set([...request.queue.evidenceRefs,...decisions.flatMap(decision=>decision.evidenceRefs)])].sort(),truncated:ordered.length>request.maxDecisions};
  return freeze({...base,decisionSetId:`eae_human_review_decision_set_${hash(base)}`});
}
