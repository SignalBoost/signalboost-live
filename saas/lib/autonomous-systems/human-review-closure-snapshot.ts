import type { TenantContext } from './types.ts';
import type { EnterpriseHumanReviewOutcomeSnapshot } from './human-review-outcome-composer.ts';
import type { EnterpriseHumanReviewOutcomeAcknowledgmentSnapshot } from './human-review-outcome-acknowledgment.ts';

export const EAE_HUMAN_REVIEW_CLOSURE_SCHEMA_VERSION = '1.0.0' as const;
export type HumanReviewClosureDisposition = 'closed' | 'pending_acknowledgment' | 'blocked' | 'invalid' | 'empty';

export interface EnterpriseHumanReviewClosureRequest {
  readonly tenant: TenantContext;
  readonly outcome: EnterpriseHumanReviewOutcomeSnapshot;
  readonly acknowledgmentRegistry: EnterpriseHumanReviewOutcomeAcknowledgmentSnapshot;
}

export interface EnterpriseHumanReviewClosureSnapshot {
  readonly schemaVersion: typeof EAE_HUMAN_REVIEW_CLOSURE_SCHEMA_VERSION;
  readonly closureId: string;
  readonly tenant: TenantContext;
  readonly outcomeId: string;
  readonly acknowledgmentRegistryId: string;
  readonly disposition: HumanReviewClosureDisposition;
  readonly closedProposalIds: readonly string[];
  readonly pendingProposalIds: readonly string[];
  readonly evidenceRefs: readonly string[];
  readonly readOnly: true;
  readonly executable: false;
}

function tenantKey(t: TenantContext): string { return `${t.tenantId}:${t.environmentId}`; }
function canonical(v: unknown): string { if(Array.isArray(v)) return `[${v.map(canonical).join(',')}]`; if(v&&typeof v==='object') return `{${Object.entries(v as Record<string,unknown>).sort(([a],[b])=>a.localeCompare(b)).map(([k,x])=>`${JSON.stringify(k)}:${canonical(x)}`).join(',')}}`; const x=JSON.stringify(v); if(x===undefined) throw new Error('non_json_value_rejected'); return x; }
function hash(v: unknown): string { let h=2166136261; for(const c of canonical(v)){ h^=c.charCodeAt(0); h=Math.imul(h,16777619); } return (h>>>0).toString(16).padStart(8,'0'); }
function freeze<T>(v:T):T { if(!v||typeof v!=='object'||Object.isFrozen(v)) return v; Object.freeze(v); for(const x of Object.values(v as Record<string,unknown>)) freeze(x); return v; }

export function buildEnterpriseHumanReviewClosureSnapshot(request: EnterpriseHumanReviewClosureRequest): EnterpriseHumanReviewClosureSnapshot {
  if(!request.tenant.tenantId||!request.tenant.environmentId) throw new Error('tenant_required');
  if(tenantKey(request.outcome.tenant)!==tenantKey(request.tenant)) throw new Error('review_outcome_tenant_boundary_violation');
  if(tenantKey(request.acknowledgmentRegistry.tenant)!==tenantKey(request.tenant)) throw new Error('acknowledgment_registry_tenant_boundary_violation');
  if(request.outcome.executable!==false||request.outcome.readOnly!==true) throw new Error('unsafe_review_outcome_rejected');
  if(request.acknowledgmentRegistry.executable!==false||request.acknowledgmentRegistry.readOnly!==true) throw new Error('unsafe_acknowledgment_registry_rejected');
  if(request.acknowledgmentRegistry.outcomeId!==request.outcome.outcomeId) throw new Error('acknowledgment_registry_outcome_mismatch');
  const allProposalIds=[...new Set(request.outcome.items.map(item=>item.proposalId))].sort();
  const pendingProposalIds=[...new Set(request.acknowledgmentRegistry.unacknowledgedProposalIds)].sort();
  const pending=new Set(pendingProposalIds);
  const closedProposalIds=allProposalIds.filter(id=>!pending.has(id));
  let disposition:HumanReviewClosureDisposition='closed';
  if(request.outcome.disposition==='blocked'||request.acknowledgmentRegistry.disposition==='blocked') disposition='blocked';
  else if(request.outcome.disposition==='invalid'||request.acknowledgmentRegistry.disposition==='invalid') disposition='invalid';
  else if(allProposalIds.length===0) disposition='empty';
  else if(pendingProposalIds.length>0||request.acknowledgmentRegistry.disposition==='partial') disposition='pending_acknowledgment';
  const base={schemaVersion:EAE_HUMAN_REVIEW_CLOSURE_SCHEMA_VERSION,tenant:request.tenant,outcomeId:request.outcome.outcomeId,acknowledgmentRegistryId:request.acknowledgmentRegistry.registryId,disposition,closedProposalIds,pendingProposalIds,evidenceRefs:[...new Set([...request.outcome.evidenceRefs,...request.acknowledgmentRegistry.evidenceRefs])].sort(),readOnly:true as const,executable:false as const};
  return freeze({...base,closureId:`eae_human_review_closure_${hash(base)}`});
}
