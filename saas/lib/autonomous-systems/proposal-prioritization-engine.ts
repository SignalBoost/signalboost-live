import type { TenantContext } from './types.ts';
import type { AdaptationTarget, EnterpriseAdaptationProposalSnapshot } from './adaptation-proposal-engine.ts';

export const EAE_PROPOSAL_PRIORITIZATION_SCHEMA_VERSION = '1.0.0' as const;
export type ProposalPriorityBand = 'critical' | 'high' | 'normal' | 'low';
export type ProposalPrioritizationDisposition = 'ready_for_human_review' | 'needs_evidence' | 'blocked';

export interface EnterpriseProposalPrioritizationRequest {
  readonly tenant: TenantContext;
  readonly proposalSet: EnterpriseAdaptationProposalSnapshot;
  readonly targetWeights: Readonly<Partial<Record<AdaptationTarget, number>>>;
  readonly maxRankedProposals: number;
}

export interface RankedEnterpriseAdaptationProposal {
  readonly rank: number;
  readonly proposalId: string;
  readonly signalId: string;
  readonly target: AdaptationTarget;
  readonly priorityBand: ProposalPriorityBand;
  readonly priorityScore: number;
  readonly requiresHumanApproval: true;
  readonly executable: false;
  readonly evidenceRefs: readonly string[];
}

export interface EnterpriseProposalPrioritizationSnapshot {
  readonly schemaVersion: typeof EAE_PROPOSAL_PRIORITIZATION_SCHEMA_VERSION;
  readonly prioritizationId: string;
  readonly tenant: TenantContext;
  readonly proposalSetId: string;
  readonly feedbackId: string;
  readonly disposition: ProposalPrioritizationDisposition;
  readonly readOnly: true;
  readonly executable: false;
  readonly rankedProposals: readonly RankedEnterpriseAdaptationProposal[];
  readonly evidenceRefs: readonly string[];
  readonly truncated: boolean;
}

function tenantKey(t: TenantContext): string { return `${t.tenantId}:${t.environmentId}`; }
function canonical(v: unknown): string { if(Array.isArray(v)) return `[${v.map(canonical).join(',')}]`; if(v&&typeof v==='object') return `{${Object.entries(v as Record<string,unknown>).sort(([a],[b])=>a.localeCompare(b)).map(([k,x])=>`${JSON.stringify(k)}:${canonical(x)}`).join(',')}}`; const x=JSON.stringify(v); if(x===undefined) throw new Error('non_json_value_rejected'); return x; }
function hash(v: unknown): string { let h=2166136261; for(const c of canonical(v)){ h^=c.charCodeAt(0); h=Math.imul(h,16777619); } return (h>>>0).toString(16).padStart(8,'0'); }
function freeze<T>(v:T):T { if(!v||typeof v!=='object'||Object.isFrozen(v)) return v; Object.freeze(v); for(const x of Object.values(v as Record<string,unknown>)) freeze(x); return v; }
function band(score:number):ProposalPriorityBand { return score>=0.9?'critical':score>=0.7?'high':score>=0.4?'normal':'low'; }

export function prioritizeEnterpriseAdaptationProposals(request: EnterpriseProposalPrioritizationRequest): EnterpriseProposalPrioritizationSnapshot {
  if(!request.tenant.tenantId||!request.tenant.environmentId) throw new Error('tenant_required');
  if(tenantKey(request.proposalSet.tenant)!==tenantKey(request.tenant)) throw new Error('proposal_set_tenant_boundary_violation');
  if(request.proposalSet.executable!==false||request.proposalSet.readOnly!==true) throw new Error('unsafe_proposal_set_rejected');
  if(!Number.isInteger(request.maxRankedProposals)||request.maxRankedProposals<1||request.maxRankedProposals>256) throw new Error('unbounded_proposal_prioritization_rejected');
  for(const [target,weight] of Object.entries(request.targetWeights)){
    if(!['objective','policy','capability','plan','evidence'].includes(target)||!Number.isFinite(weight)||weight!<0||weight!>1) throw new Error('invalid_target_weight');
  }
  const ids=new Set<string>();
  for(const proposal of request.proposalSet.proposals){
    if(ids.has(proposal.proposalId)) throw new Error('duplicate_proposal_id');
    ids.add(proposal.proposalId);
    if(proposal.executable!==false||proposal.requiresHumanApproval!==true) throw new Error('unsafe_proposal_rejected');
  }
  const ranked=request.proposalSet.proposals.map(proposal=>{
    const weight=request.targetWeights[proposal.target]??0.5;
    const priorityScore=Number(Math.max(0,Math.min(1,(proposal.confidence*0.7)+(weight*0.3))).toFixed(4));
    return {proposalId:proposal.proposalId,signalId:proposal.signalId,target:proposal.target,priorityBand:band(priorityScore),priorityScore,requiresHumanApproval:true as const,executable:false as const,evidenceRefs:[...new Set(proposal.evidenceRefs)].sort()};
  }).sort((a,b)=>b.priorityScore-a.priorityScore||a.proposalId.localeCompare(b.proposalId)).slice(0,request.maxRankedProposals).map((proposal,index)=>({...proposal,rank:index+1}));
  let disposition:ProposalPrioritizationDisposition='ready_for_human_review';
  if(request.proposalSet.disposition==='blocked') disposition='blocked';
  else if(request.proposalSet.disposition==='needs_evidence') disposition='needs_evidence';
  const base={schemaVersion:EAE_PROPOSAL_PRIORITIZATION_SCHEMA_VERSION,tenant:request.tenant,proposalSetId:request.proposalSet.proposalSetId,feedbackId:request.proposalSet.feedbackId,disposition,readOnly:true as const,executable:false as const,rankedProposals:ranked,evidenceRefs:[...new Set([...request.proposalSet.evidenceRefs,...ranked.flatMap(proposal=>proposal.evidenceRefs)])].sort(),truncated:request.proposalSet.proposals.length>request.maxRankedProposals};
  return freeze({...base,prioritizationId:`eae_proposal_prioritization_${hash(base)}`});
}
