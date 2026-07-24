import type { TenantContext } from './types.ts';
import type { EnterpriseLearningFeedbackSnapshot, LearningSignalKind } from './learning-feedback-engine.ts';

export const EAE_ADAPTATION_PROPOSAL_SCHEMA_VERSION = '1.0.0' as const;
export type AdaptationTarget = 'objective' | 'policy' | 'capability' | 'plan' | 'evidence';
export type AdaptationProposalDisposition = 'ready_for_human_review' | 'needs_evidence' | 'blocked';

export interface EnterpriseAdaptationProposalRequest {
  readonly tenant: TenantContext;
  readonly feedback: EnterpriseLearningFeedbackSnapshot;
  readonly acknowledgedProposalIds: readonly string[];
  readonly maxProposals: number;
}

export interface EnterpriseAdaptationProposal {
  readonly proposalId: string;
  readonly signalId: string;
  readonly target: AdaptationTarget;
  readonly action: string;
  readonly rationale: string;
  readonly confidence: number;
  readonly requiresHumanApproval: true;
  readonly executable: false;
  readonly evidenceRefs: readonly string[];
}

export interface EnterpriseAdaptationProposalSnapshot {
  readonly schemaVersion: typeof EAE_ADAPTATION_PROPOSAL_SCHEMA_VERSION;
  readonly proposalSetId: string;
  readonly tenant: TenantContext;
  readonly feedbackId: string;
  readonly evaluationId: string;
  readonly disposition: AdaptationProposalDisposition;
  readonly readOnly: true;
  readonly executable: false;
  readonly proposals: readonly EnterpriseAdaptationProposal[];
  readonly acknowledgedProposalIds: readonly string[];
  readonly evidenceRefs: readonly string[];
  readonly truncated: boolean;
}

function tenantKey(t: TenantContext): string { return `${t.tenantId}:${t.environmentId}`; }
function canonical(v: unknown): string { if(Array.isArray(v)) return `[${v.map(canonical).join(',')}]`; if(v&&typeof v==='object') return `{${Object.entries(v as Record<string,unknown>).sort(([a],[b])=>a.localeCompare(b)).map(([k,x])=>`${JSON.stringify(k)}:${canonical(x)}`).join(',')}}`; const x=JSON.stringify(v); if(x===undefined) throw new Error('non_json_value_rejected'); return x; }
function hash(v: unknown): string { let h=2166136261; for(const c of canonical(v)){ h^=c.charCodeAt(0); h=Math.imul(h,16777619); } return (h>>>0).toString(16).padStart(8,'0'); }
function freeze<T>(v:T):T { if(!v||typeof v!=='object'||Object.isFrozen(v)) return v; Object.freeze(v); for(const x of Object.values(v as Record<string,unknown>)) freeze(x); return v; }
function targetFor(kind:LearningSignalKind):AdaptationTarget { return kind==='reinforce'?'objective':kind==='adjust'?'plan':kind==='investigate'?'evidence':'policy'; }
function actionFor(kind:LearningSignalKind):string { return kind==='reinforce'?'retain_successful_configuration':kind==='adjust'?'propose_bounded_plan_adjustment':kind==='investigate'?'request_additional_evidence':'preserve_current_state_pending_review'; }

export function proposeEnterpriseAdaptations(request: EnterpriseAdaptationProposalRequest): EnterpriseAdaptationProposalSnapshot {
  if(!request.tenant.tenantId||!request.tenant.environmentId) throw new Error('tenant_required');
  if(tenantKey(request.feedback.tenant)!==tenantKey(request.tenant)) throw new Error('feedback_tenant_boundary_violation');
  if(request.feedback.executable!==false||request.feedback.readOnly!==true) throw new Error('unsafe_feedback_rejected');
  if(!Number.isInteger(request.maxProposals)||request.maxProposals<1||request.maxProposals>256) throw new Error('unbounded_adaptation_proposal_rejected');
  const acknowledged=new Set(request.acknowledgedProposalIds);
  if(acknowledged.size!==request.acknowledgedProposalIds.length) throw new Error('duplicate_acknowledged_proposal_id');
  const candidates=request.feedback.signals.map(signal=>{
    const base={signalId:signal.signalId,target:targetFor(signal.kind),action:actionFor(signal.kind),rationale:signal.reason,confidence:signal.confidence,requiresHumanApproval:true as const,executable:false as const,evidenceRefs:[...new Set(signal.evidenceRefs)].sort()};
    return {...base,proposalId:`eae_adaptation_proposal_${hash(base)}`};
  }).sort((a,b)=>a.proposalId.localeCompare(b.proposalId));
  const proposals=candidates.filter(proposal=>!acknowledged.has(proposal.proposalId)).slice(0,request.maxProposals);
  let disposition:AdaptationProposalDisposition='ready_for_human_review';
  if(request.feedback.disposition==='blocked') disposition='blocked';
  else if(request.feedback.disposition==='needs_evidence'||proposals.some(proposal=>proposal.target==='evidence')) disposition='needs_evidence';
  const base={schemaVersion:EAE_ADAPTATION_PROPOSAL_SCHEMA_VERSION,tenant:request.tenant,feedbackId:request.feedback.feedbackId,evaluationId:request.feedback.evaluationId,disposition,readOnly:true as const,executable:false as const,proposals,acknowledgedProposalIds:[...acknowledged].sort(),evidenceRefs:[...new Set([...request.feedback.evidenceRefs,...proposals.flatMap(proposal=>proposal.evidenceRefs)])].sort(),truncated:candidates.filter(proposal=>!acknowledged.has(proposal.proposalId)).length>request.maxProposals};
  return freeze({...base,proposalSetId:`eae_adaptation_proposal_set_${hash(base)}`});
}
