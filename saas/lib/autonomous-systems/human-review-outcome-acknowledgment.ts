import type { TenantContext } from './types.ts';
import type { EnterpriseHumanReviewOutcomeSnapshot } from './human-review-outcome-composer.ts';

export const EAE_HUMAN_REVIEW_OUTCOME_ACK_SCHEMA_VERSION = '1.0.0' as const;
export type HumanReviewOutcomeAcknowledgmentDisposition = 'complete' | 'partial' | 'blocked' | 'invalid' | 'empty';

export interface HumanReviewOutcomeAcknowledgment {
  readonly outcomeItemProposalId: string;
  readonly acknowledgedBy: string;
  readonly note: string;
  readonly evidenceRefs: readonly string[];
}

export interface EnterpriseHumanReviewOutcomeAcknowledgmentRequest {
  readonly tenant: TenantContext;
  readonly outcome: EnterpriseHumanReviewOutcomeSnapshot;
  readonly acknowledgments: readonly HumanReviewOutcomeAcknowledgment[];
  readonly priorAcknowledgmentIds: readonly string[];
  readonly maxAcknowledgments: number;
}

export interface EnterpriseHumanReviewOutcomeAcknowledgmentRecord {
  readonly acknowledgmentId: string;
  readonly outcomeId: string;
  readonly proposalId: string;
  readonly acknowledgedBy: string;
  readonly note: string;
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly evidenceRefs: readonly string[];
  readonly readOnly: true;
  readonly executable: false;
}

export interface EnterpriseHumanReviewOutcomeAcknowledgmentSnapshot {
  readonly schemaVersion: typeof EAE_HUMAN_REVIEW_OUTCOME_ACK_SCHEMA_VERSION;
  readonly registryId: string;
  readonly tenant: TenantContext;
  readonly outcomeId: string;
  readonly disposition: HumanReviewOutcomeAcknowledgmentDisposition;
  readonly readOnly: true;
  readonly executable: false;
  readonly records: readonly EnterpriseHumanReviewOutcomeAcknowledgmentRecord[];
  readonly unacknowledgedProposalIds: readonly string[];
  readonly priorAcknowledgmentIds: readonly string[];
  readonly evidenceRefs: readonly string[];
  readonly truncated: boolean;
}

function tenantKey(t: TenantContext): string { return `${t.tenantId}:${t.environmentId}`; }
function canonical(v: unknown): string { if(Array.isArray(v)) return `[${v.map(canonical).join(',')}]`; if(v&&typeof v==='object') return `{${Object.entries(v as Record<string,unknown>).sort(([a],[b])=>a.localeCompare(b)).map(([k,x])=>`${JSON.stringify(k)}:${canonical(x)}`).join(',')}}`; const x=JSON.stringify(v); if(x===undefined) throw new Error('non_json_value_rejected'); return x; }
function hash(v: unknown): string { let h=2166136261; for(const c of canonical(v)){ h^=c.charCodeAt(0); h=Math.imul(h,16777619); } return (h>>>0).toString(16).padStart(8,'0'); }
function freeze<T>(v:T):T { if(!v||typeof v!=='object'||Object.isFrozen(v)) return v; Object.freeze(v); for(const x of Object.values(v as Record<string,unknown>)) freeze(x); return v; }

export function buildEnterpriseHumanReviewOutcomeAcknowledgmentRegistry(request: EnterpriseHumanReviewOutcomeAcknowledgmentRequest): EnterpriseHumanReviewOutcomeAcknowledgmentSnapshot {
  if(!request.tenant.tenantId||!request.tenant.environmentId) throw new Error('tenant_required');
  if(tenantKey(request.outcome.tenant)!==tenantKey(request.tenant)) throw new Error('review_outcome_tenant_boundary_violation');
  if(request.outcome.executable!==false||request.outcome.readOnly!==true) throw new Error('unsafe_review_outcome_rejected');
  if(!Number.isInteger(request.maxAcknowledgments)||request.maxAcknowledgments<1||request.maxAcknowledgments>512) throw new Error('unbounded_outcome_acknowledgments_rejected');
  const prior=new Set(request.priorAcknowledgmentIds);
  if(prior.size!==request.priorAcknowledgmentIds.length) throw new Error('duplicate_prior_acknowledgment_id');
  const proposalIds=new Set(request.outcome.items.map(item=>item.proposalId));
  const seen=new Set<string>();
  const candidates=[...request.acknowledgments].sort((a,b)=>a.outcomeItemProposalId.localeCompare(b.outcomeItemProposalId)||a.acknowledgedBy.localeCompare(b.acknowledgedBy)).map(ack=>{
    const errors:string[]=[];
    const duplicateKey=`${ack.outcomeItemProposalId}:${ack.acknowledgedBy}`;
    if(seen.has(duplicateKey)) errors.push('duplicate_acknowledgment'); else seen.add(duplicateKey);
    if(!proposalIds.has(ack.outcomeItemProposalId)) errors.push('unknown_outcome_proposal');
    if(!ack.acknowledgedBy.trim()) errors.push('acknowledged_by_required');
    if(!ack.note.trim()) errors.push('acknowledgment_note_required');
    const base={outcomeId:request.outcome.outcomeId,proposalId:ack.outcomeItemProposalId,acknowledgedBy:ack.acknowledgedBy,note:ack.note,valid:errors.length===0,errors:[...errors].sort(),evidenceRefs:[...new Set(ack.evidenceRefs)].sort(),readOnly:true as const,executable:false as const};
    return {...base,acknowledgmentId:`eae_human_review_outcome_ack_${hash(base)}`};
  }).filter(record=>!prior.has(record.acknowledgmentId));
  const records=candidates.slice(0,request.maxAcknowledgments);
  const acknowledgedProposalIds=new Set(records.filter(record=>record.valid).map(record=>record.proposalId));
  const unacknowledgedProposalIds=[...proposalIds].filter(id=>!acknowledgedProposalIds.has(id)).sort();
  let disposition:HumanReviewOutcomeAcknowledgmentDisposition='complete';
  if(request.outcome.disposition==='blocked') disposition='blocked';
  else if(request.outcome.disposition==='invalid'||records.some(record=>!record.valid)) disposition='invalid';
  else if(proposalIds.size===0) disposition='empty';
  else if(unacknowledgedProposalIds.length>0) disposition='partial';
  const base={schemaVersion:EAE_HUMAN_REVIEW_OUTCOME_ACK_SCHEMA_VERSION,tenant:request.tenant,outcomeId:request.outcome.outcomeId,disposition,readOnly:true as const,executable:false as const,records,unacknowledgedProposalIds,priorAcknowledgmentIds:[...prior].sort(),evidenceRefs:[...new Set([...request.outcome.evidenceRefs,...records.flatMap(record=>record.evidenceRefs)])].sort(),truncated:candidates.length>request.maxAcknowledgments};
  return freeze({...base,registryId:`eae_human_review_outcome_ack_registry_${hash(base)}`});
}
