import type { TenantContext } from './types.ts';
import type { EnterpriseAdaptationProposalSnapshot, EnterpriseAdaptationProposal } from './adaptation-proposal-engine.ts';

export const EAE_HUMAN_REVIEW_QUEUE_SCHEMA_VERSION = '1.0.0' as const;
export type ReviewQueueDisposition = 'ready' | 'needs_evidence' | 'blocked';
export type ReviewQueuePriority = 'urgent' | 'high' | 'normal' | 'low';

export interface EnterpriseHumanReviewQueueRequest {
  readonly tenant: TenantContext;
  readonly proposalSet: EnterpriseAdaptationProposalSnapshot;
  readonly deferredProposalIds: readonly string[];
  readonly maxItems: number;
}

export interface EnterpriseHumanReviewQueueItem {
  readonly queueItemId: string;
  readonly proposalId: string;
  readonly target: EnterpriseAdaptationProposal['target'];
  readonly priority: ReviewQueuePriority;
  readonly rationale: string;
  readonly confidence: number;
  readonly requiresHumanApproval: true;
  readonly executable: false;
  readonly evidenceRefs: readonly string[];
}

export interface EnterpriseHumanReviewQueueSnapshot {
  readonly schemaVersion: typeof EAE_HUMAN_REVIEW_QUEUE_SCHEMA_VERSION;
  readonly queueId: string;
  readonly tenant: TenantContext;
  readonly proposalSetId: string;
  readonly disposition: ReviewQueueDisposition;
  readonly readOnly: true;
  readonly executable: false;
  readonly items: readonly EnterpriseHumanReviewQueueItem[];
  readonly deferredProposalIds: readonly string[];
  readonly evidenceRefs: readonly string[];
  readonly truncated: boolean;
}

function tenantKey(t: TenantContext): string { return `${t.tenantId}:${t.environmentId}`; }
function canonical(v: unknown): string { if(Array.isArray(v)) return `[${v.map(canonical).join(',')}]`; if(v&&typeof v==='object') return `{${Object.entries(v as Record<string,unknown>).sort(([a],[b])=>a.localeCompare(b)).map(([k,x])=>`${JSON.stringify(k)}:${canonical(x)}`).join(',')}}`; const x=JSON.stringify(v); if(x===undefined) throw new Error('non_json_value_rejected'); return x; }
function hash(v: unknown): string { let h=2166136261; for(const c of canonical(v)){ h^=c.charCodeAt(0); h=Math.imul(h,16777619); } return (h>>>0).toString(16).padStart(8,'0'); }
function freeze<T>(v:T):T { if(!v||typeof v!=='object'||Object.isFrozen(v)) return v; Object.freeze(v); for(const x of Object.values(v as Record<string,unknown>)) freeze(x); return v; }
function priorityFor(proposal:EnterpriseAdaptationProposal):ReviewQueuePriority { if(proposal.target==='policy'&&proposal.confidence>=0.8) return 'urgent'; if(proposal.target==='evidence') return 'high'; if(proposal.confidence>=0.75) return 'high'; if(proposal.confidence>=0.4) return 'normal'; return 'low'; }

export function buildEnterpriseHumanReviewQueue(request: EnterpriseHumanReviewQueueRequest): EnterpriseHumanReviewQueueSnapshot {
  if(!request.tenant.tenantId||!request.tenant.environmentId) throw new Error('tenant_required');
  if(tenantKey(request.proposalSet.tenant)!==tenantKey(request.tenant)) throw new Error('proposal_set_tenant_boundary_violation');
  if(request.proposalSet.executable!==false||request.proposalSet.readOnly!==true) throw new Error('unsafe_proposal_set_rejected');
  if(!Number.isInteger(request.maxItems)||request.maxItems<1||request.maxItems>256) throw new Error('unbounded_review_queue_rejected');
  const deferred=new Set(request.deferredProposalIds);
  if(deferred.size!==request.deferredProposalIds.length) throw new Error('duplicate_deferred_proposal_id');
  const candidates=request.proposalSet.proposals.filter(proposal=>!deferred.has(proposal.proposalId)).map(proposal=>{
    const base={proposalId:proposal.proposalId,target:proposal.target,priority:priorityFor(proposal),rationale:proposal.rationale,confidence:proposal.confidence,requiresHumanApproval:true as const,executable:false as const,evidenceRefs:[...new Set(proposal.evidenceRefs)].sort()};
    return {...base,queueItemId:`eae_human_review_item_${hash(base)}`};
  }).sort((a,b)=>{const order={urgent:0,high:1,normal:2,low:3}; return order[a.priority]-order[b.priority]||b.confidence-a.confidence||a.proposalId.localeCompare(b.proposalId);});
  const items=candidates.slice(0,request.maxItems);
  const disposition:ReviewQueueDisposition=request.proposalSet.disposition==='blocked'?'blocked':request.proposalSet.disposition==='needs_evidence'||items.some(item=>item.target==='evidence')?'needs_evidence':'ready';
  const base={schemaVersion:EAE_HUMAN_REVIEW_QUEUE_SCHEMA_VERSION,tenant:request.tenant,proposalSetId:request.proposalSet.proposalSetId,disposition,readOnly:true as const,executable:false as const,items,deferredProposalIds:[...deferred].sort(),evidenceRefs:[...new Set([...request.proposalSet.evidenceRefs,...items.flatMap(item=>item.evidenceRefs)])].sort(),truncated:candidates.length>request.maxItems};
  return freeze({...base,queueId:`eae_human_review_queue_${hash(base)}`});
}
