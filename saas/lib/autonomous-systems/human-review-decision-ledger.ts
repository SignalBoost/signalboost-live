import type { TenantContext } from './types.ts';
import type { EnterpriseHumanReviewDecisionSnapshot, ValidatedHumanReviewDecision } from './human-review-decision-validator.ts';

export const EAE_HUMAN_REVIEW_DECISION_LEDGER_SCHEMA_VERSION = '1.0.0' as const;
export type HumanReviewLedgerDisposition = 'complete' | 'needs_evidence' | 'blocked' | 'invalid';

export interface EnterpriseHumanReviewDecisionLedgerRequest {
  readonly tenant: TenantContext;
  readonly decisionSets: readonly EnterpriseHumanReviewDecisionSnapshot[];
  readonly priorEntryIds: readonly string[];
  readonly maxEntries: number;
}

export interface EnterpriseHumanReviewDecisionLedgerEntry {
  readonly entryId: string;
  readonly decisionSetId: string;
  readonly decisionId: string;
  readonly queueId: string;
  readonly proposalId: string;
  readonly reviewerId: string;
  readonly decision: ValidatedHumanReviewDecision['decision'];
  readonly reason: string;
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly evidenceRefs: readonly string[];
  readonly readOnly: true;
  readonly executable: false;
}

export interface EnterpriseHumanReviewDecisionLedgerSnapshot {
  readonly schemaVersion: typeof EAE_HUMAN_REVIEW_DECISION_LEDGER_SCHEMA_VERSION;
  readonly ledgerId: string;
  readonly tenant: TenantContext;
  readonly disposition: HumanReviewLedgerDisposition;
  readonly readOnly: true;
  readonly executable: false;
  readonly entries: readonly EnterpriseHumanReviewDecisionLedgerEntry[];
  readonly priorEntryIds: readonly string[];
  readonly evidenceRefs: readonly string[];
  readonly truncated: boolean;
}

function tenantKey(t: TenantContext): string { return `${t.tenantId}:${t.environmentId}`; }
function canonical(v: unknown): string { if(Array.isArray(v)) return `[${v.map(canonical).join(',')}]`; if(v&&typeof v==='object') return `{${Object.entries(v as Record<string,unknown>).sort(([a],[b])=>a.localeCompare(b)).map(([k,x])=>`${JSON.stringify(k)}:${canonical(x)}`).join(',')}}`; const x=JSON.stringify(v); if(x===undefined) throw new Error('non_json_value_rejected'); return x; }
function hash(v: unknown): string { let h=2166136261; for(const c of canonical(v)){ h^=c.charCodeAt(0); h=Math.imul(h,16777619); } return (h>>>0).toString(16).padStart(8,'0'); }
function freeze<T>(v:T):T { if(!v||typeof v!=='object'||Object.isFrozen(v)) return v; Object.freeze(v); for(const x of Object.values(v as Record<string,unknown>)) freeze(x); return v; }

export function buildEnterpriseHumanReviewDecisionLedger(request: EnterpriseHumanReviewDecisionLedgerRequest): EnterpriseHumanReviewDecisionLedgerSnapshot {
  if(!request.tenant.tenantId||!request.tenant.environmentId) throw new Error('tenant_required');
  if(!Number.isInteger(request.maxEntries)||request.maxEntries<1||request.maxEntries>512) throw new Error('unbounded_decision_ledger_rejected');
  const prior=new Set(request.priorEntryIds);
  if(prior.size!==request.priorEntryIds.length) throw new Error('duplicate_prior_entry_id');
  for(const set of request.decisionSets){
    if(tenantKey(set.tenant)!==tenantKey(request.tenant)) throw new Error('decision_set_tenant_boundary_violation');
    if(set.executable!==false||set.readOnly!==true) throw new Error('unsafe_decision_set_rejected');
  }
  const candidates=request.decisionSets.flatMap(set=>set.decisions.map(decision=>{
    const base={decisionSetId:set.decisionSetId,decisionId:decision.decisionId,queueId:set.queueId,proposalId:decision.proposalId,reviewerId:decision.reviewerId,decision:decision.decision,reason:decision.reason,valid:decision.valid,errors:[...new Set(decision.errors)].sort(),evidenceRefs:[...new Set(decision.evidenceRefs)].sort(),readOnly:true as const,executable:false as const};
    return {...base,entryId:`eae_human_review_ledger_entry_${hash(base)}`};
  })).sort((a,b)=>a.entryId.localeCompare(b.entryId));
  const active=candidates.filter(entry=>!prior.has(entry.entryId));
  const entries=active.slice(0,request.maxEntries);
  let disposition:HumanReviewLedgerDisposition='complete';
  if(request.decisionSets.some(set=>set.disposition==='blocked')) disposition='blocked';
  else if(request.decisionSets.some(set=>set.disposition==='needs_evidence')) disposition='needs_evidence';
  else if(entries.some(entry=>!entry.valid)) disposition='invalid';
  const base={schemaVersion:EAE_HUMAN_REVIEW_DECISION_LEDGER_SCHEMA_VERSION,tenant:request.tenant,disposition,readOnly:true as const,executable:false as const,entries,priorEntryIds:[...prior].sort(),evidenceRefs:[...new Set([...request.decisionSets.flatMap(set=>set.evidenceRefs),...entries.flatMap(entry=>entry.evidenceRefs)])].sort(),truncated:active.length>request.maxEntries};
  return freeze({...base,ledgerId:`eae_human_review_decision_ledger_${hash(base)}`});
}
