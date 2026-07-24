import type { TenantContext } from './types.ts';
import type { EnterpriseHumanReviewArchiveAttestationSnapshot } from './human-review-archive-attestation.ts';

export const EAE_HUMAN_REVIEW_ATTESTATION_REGISTRY_SCHEMA_VERSION = '1.0.0' as const;
export type HumanReviewAttestationRegistryDisposition = 'complete' | 'partial' | 'rejected' | 'empty';

export interface EnterpriseHumanReviewAttestationRegistryRequest {
  readonly tenant: TenantContext;
  readonly attestations: readonly EnterpriseHumanReviewArchiveAttestationSnapshot[];
  readonly priorAttestationIds: readonly string[];
  readonly maxEntries: number;
}

export interface EnterpriseHumanReviewAttestationRegistryEntry {
  readonly attestationId: string;
  readonly archiveId: string;
  readonly validationId: string;
  readonly attestorId: string;
  readonly disposition: EnterpriseHumanReviewArchiveAttestationSnapshot['disposition'];
  readonly evidenceRefs: readonly string[];
  readonly readOnly: true;
  readonly executable: false;
}

export interface EnterpriseHumanReviewAttestationRegistrySnapshot {
  readonly schemaVersion: typeof EAE_HUMAN_REVIEW_ATTESTATION_REGISTRY_SCHEMA_VERSION;
  readonly registryId: string;
  readonly tenant: TenantContext;
  readonly disposition: HumanReviewAttestationRegistryDisposition;
  readonly entries: readonly EnterpriseHumanReviewAttestationRegistryEntry[];
  readonly priorAttestationIds: readonly string[];
  readonly evidenceRefs: readonly string[];
  readonly truncated: boolean;
  readonly readOnly: true;
  readonly executable: false;
}

function tenantKey(t: TenantContext): string { return `${t.tenantId}:${t.environmentId}`; }
function canonical(v: unknown): string { if(Array.isArray(v)) return `[${v.map(canonical).join(',')}]`; if(v&&typeof v==='object') return `{${Object.entries(v as Record<string,unknown>).sort(([a],[b])=>a.localeCompare(b)).map(([k,x])=>`${JSON.stringify(k)}:${canonical(x)}`).join(',')}}`; const x=JSON.stringify(v); if(x===undefined) throw new Error('non_json_value_rejected'); return x; }
function hash(v: unknown): string { let h=2166136261; for(const c of canonical(v)){ h^=c.charCodeAt(0); h=Math.imul(h,16777619); } return (h>>>0).toString(16).padStart(8,'0'); }
function freeze<T>(v:T):T { if(!v||typeof v!=='object'||Object.isFrozen(v)) return v; Object.freeze(v); for(const x of Object.values(v as Record<string,unknown>)) freeze(x); return v; }

export function buildEnterpriseHumanReviewAttestationRegistry(request: EnterpriseHumanReviewAttestationRegistryRequest): EnterpriseHumanReviewAttestationRegistrySnapshot {
  if(!request.tenant.tenantId||!request.tenant.environmentId) throw new Error('tenant_required');
  if(!Number.isInteger(request.maxEntries)||request.maxEntries<1||request.maxEntries>512) throw new Error('unbounded_attestation_registry_rejected');
  const prior=new Set(request.priorAttestationIds);
  if(prior.size!==request.priorAttestationIds.length) throw new Error('duplicate_prior_attestation_id');
  for(const attestation of request.attestations){
    if(tenantKey(attestation.tenant)!==tenantKey(request.tenant)) throw new Error('archive_attestation_tenant_boundary_violation');
    if(attestation.executable!==false||attestation.readOnly!==true) throw new Error('unsafe_archive_attestation_rejected');
  }
  const candidates=request.attestations.filter(attestation=>!prior.has(attestation.attestationId)).map(attestation=>({attestationId:attestation.attestationId,archiveId:attestation.archiveId,validationId:attestation.validationId,attestorId:attestation.attestorId,disposition:attestation.disposition,evidenceRefs:[...new Set(attestation.evidenceRefs)].sort(),readOnly:true as const,executable:false as const})).sort((a,b)=>a.attestationId.localeCompare(b.attestationId));
  const entries=candidates.slice(0,request.maxEntries);
  let disposition:HumanReviewAttestationRegistryDisposition='complete';
  if(entries.length===0&&request.attestations.length===0) disposition='empty';
  else if(entries.some(entry=>entry.disposition==='rejected')) disposition='rejected';
  else if(entries.some(entry=>entry.disposition==='empty')||candidates.length>request.maxEntries) disposition='partial';
  const base={schemaVersion:EAE_HUMAN_REVIEW_ATTESTATION_REGISTRY_SCHEMA_VERSION,tenant:request.tenant,disposition,entries,priorAttestationIds:[...prior].sort(),evidenceRefs:[...new Set(entries.flatMap(entry=>entry.evidenceRefs))].sort(),truncated:candidates.length>request.maxEntries,readOnly:true as const,executable:false as const};
  return freeze({...base,registryId:`eae_human_review_attestation_registry_${hash(base)}`});
}
