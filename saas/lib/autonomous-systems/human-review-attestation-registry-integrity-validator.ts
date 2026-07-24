import type { TenantContext } from './types.ts';
import type { EnterpriseHumanReviewAttestationRegistrySnapshot } from './human-review-attestation-registry.ts';

export const EAE_HUMAN_REVIEW_ATTESTATION_REGISTRY_INTEGRITY_SCHEMA_VERSION = '1.0.0' as const;
export type HumanReviewAttestationRegistryIntegrityDisposition = 'valid' | 'invalid' | 'empty';

export interface EnterpriseHumanReviewAttestationRegistryIntegrityRequest {
  readonly tenant: TenantContext;
  readonly registry: EnterpriseHumanReviewAttestationRegistrySnapshot;
  readonly maxEntries: number;
}

export interface EnterpriseHumanReviewAttestationRegistryIntegrityResult {
  readonly schemaVersion: typeof EAE_HUMAN_REVIEW_ATTESTATION_REGISTRY_INTEGRITY_SCHEMA_VERSION;
  readonly validationId: string;
  readonly tenant: TenantContext;
  readonly registryId: string;
  readonly disposition: HumanReviewAttestationRegistryIntegrityDisposition;
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly validatedAttestationIds: readonly string[];
  readonly evidenceRefs: readonly string[];
  readonly truncated: boolean;
  readonly readOnly: true;
  readonly executable: false;
}

function tenantKey(t: TenantContext): string { return `${t.tenantId}:${t.environmentId}`; }
function canonical(v: unknown): string { if(Array.isArray(v)) return `[${v.map(canonical).join(',')}]`; if(v&&typeof v==='object') return `{${Object.entries(v as Record<string,unknown>).sort(([a],[b])=>a.localeCompare(b)).map(([k,x])=>`${JSON.stringify(k)}:${canonical(x)}`).join(',')}}`; const x=JSON.stringify(v); if(x===undefined) throw new Error('non_json_value_rejected'); return x; }
function hash(v: unknown): string { let h=2166136261; for(const c of canonical(v)){ h^=c.charCodeAt(0); h=Math.imul(h,16777619); } return (h>>>0).toString(16).padStart(8,'0'); }
function freeze<T>(v:T):T { if(!v||typeof v!=='object'||Object.isFrozen(v)) return v; Object.freeze(v); for(const x of Object.values(v as Record<string,unknown>)) freeze(x); return v; }

export function validateEnterpriseHumanReviewAttestationRegistryIntegrity(request: EnterpriseHumanReviewAttestationRegistryIntegrityRequest): EnterpriseHumanReviewAttestationRegistryIntegrityResult {
  if(!request.tenant.tenantId||!request.tenant.environmentId) throw new Error('tenant_required');
  if(!Number.isInteger(request.maxEntries)||request.maxEntries<1||request.maxEntries>512) throw new Error('unbounded_attestation_registry_integrity_validation_rejected');
  if(tenantKey(request.registry.tenant)!==tenantKey(request.tenant)) throw new Error('attestation_registry_tenant_boundary_violation');
  if(request.registry.executable!==false||request.registry.readOnly!==true) throw new Error('unsafe_attestation_registry_rejected');
  const entries=request.registry.entries.slice(0,request.maxEntries);
  const errors:string[]=[];
  const ids=new Set<string>();
  for(const entry of entries){
    if(ids.has(entry.attestationId)) errors.push('duplicate_attestation_id'); else ids.add(entry.attestationId);
    if(entry.executable!==false||entry.readOnly!==true) errors.push('unsafe_attestation_registry_entry');
    if(!entry.attestationId||!entry.archiveId||!entry.validationId||!entry.attestorId) errors.push('attestation_registry_entry_identity_required');
  }
  if(request.registry.disposition==='empty'&&request.registry.entries.length>0) errors.push('empty_attestation_registry_contains_entries');
  if(request.registry.disposition!=='empty'&&request.registry.entries.length===0&&request.registry.priorAttestationIds.length===0) errors.push('nonempty_attestation_registry_missing_entries');
  if(request.registry.disposition==='complete'&&request.registry.entries.some(entry=>entry.disposition!=='attested')) errors.push('complete_registry_contains_non_attested_entry');
  if(request.registry.disposition==='rejected'&&!request.registry.entries.some(entry=>entry.disposition==='rejected')) errors.push('rejected_registry_missing_rejected_entry');
  const uniqueErrors=[...new Set(errors)].sort();
  const disposition:HumanReviewAttestationRegistryIntegrityDisposition=request.registry.entries.length===0&&uniqueErrors.length===0?'empty':uniqueErrors.length===0?'valid':'invalid';
  const base={schemaVersion:EAE_HUMAN_REVIEW_ATTESTATION_REGISTRY_INTEGRITY_SCHEMA_VERSION,tenant:request.tenant,registryId:request.registry.registryId,disposition,valid:uniqueErrors.length===0,errors:uniqueErrors,validatedAttestationIds:entries.map(entry=>entry.attestationId).sort(),evidenceRefs:[...new Set([...request.registry.evidenceRefs,...entries.flatMap(entry=>entry.evidenceRefs)])].sort(),truncated:request.registry.entries.length>request.maxEntries,readOnly:true as const,executable:false as const};
  return freeze({...base,validationId:`eae_human_review_attestation_registry_integrity_${hash(base)}`});
}
