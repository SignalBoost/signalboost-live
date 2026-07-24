import type { TenantContext } from './types.ts';
import type { EnterpriseHumanReviewNestedAttestationRegistryCertificateRegistryAttestationRegistrySnapshot } from './human-review-attestation-certificate-registry-attestation-registry-certificate-registry-attestation-registry-certificate-registry-attestation-registry-certificate-registry-attestation-registry.ts';

export const EAE_HUMAN_REVIEW_NESTED_ATTESTATION_REGISTRY_CERTIFICATE_REGISTRY_ATTESTATION_REGISTRY_INTEGRITY_SCHEMA_VERSION = '1.0.0' as const;
export type HumanReviewNestedAttestationRegistryCertificateRegistryAttestationRegistryIntegrityDisposition = 'valid' | 'invalid' | 'empty';

export interface EnterpriseHumanReviewNestedAttestationRegistryCertificateRegistryAttestationRegistryIntegrityRequest {
  readonly tenant: TenantContext;
  readonly registry: EnterpriseHumanReviewNestedAttestationRegistryCertificateRegistryAttestationRegistrySnapshot;
  readonly maxEntries: number;
}

export interface EnterpriseHumanReviewNestedAttestationRegistryCertificateRegistryAttestationRegistryIntegrityResult {
  readonly schemaVersion: typeof EAE_HUMAN_REVIEW_NESTED_ATTESTATION_REGISTRY_CERTIFICATE_REGISTRY_ATTESTATION_REGISTRY_INTEGRITY_SCHEMA_VERSION;
  readonly validationId: string;
  readonly tenant: TenantContext;
  readonly registryId: string;
  readonly disposition: HumanReviewNestedAttestationRegistryCertificateRegistryAttestationRegistryIntegrityDisposition;
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

export function validateEnterpriseHumanReviewNestedAttestationRegistryCertificateRegistryAttestationRegistryIntegrity(request: EnterpriseHumanReviewNestedAttestationRegistryCertificateRegistryAttestationRegistryIntegrityRequest): EnterpriseHumanReviewNestedAttestationRegistryCertificateRegistryAttestationRegistryIntegrityResult {
  if(!request.tenant.tenantId||!request.tenant.environmentId) throw new Error('tenant_required');
  if(!Number.isInteger(request.maxEntries)||request.maxEntries<1||request.maxEntries>512) throw new Error('unbounded_nested_attestation_registry_certificate_registry_attestation_registry_integrity_validation_rejected');
  if(tenantKey(request.registry.tenant)!==tenantKey(request.tenant)) throw new Error('nested_attestation_registry_certificate_registry_attestation_registry_tenant_boundary_violation');
  if(request.registry.executable!==false||request.registry.readOnly!==true) throw new Error('unsafe_nested_attestation_registry_certificate_registry_attestation_registry_rejected');
  const entries=request.registry.entries.slice(0,request.maxEntries);
  const errors:string[]=[];
  const attestationIds=new Set<string>();
  for(const entry of entries){
    if(!entry.attestationId||!entry.registryId||!entry.validationId||!entry.attestorId) errors.push('nested_attestation_registry_certificate_registry_attestation_registry_entry_identity_required');
    if(attestationIds.has(entry.attestationId)) errors.push('duplicate_attestation_id'); else attestationIds.add(entry.attestationId);
    if(entry.executable!==false||entry.readOnly!==true) errors.push('unsafe_nested_attestation_registry_certificate_registry_attestation_registry_entry');
    if(entry.valid&&entry.disposition==='invalid') errors.push('valid_attestation_entry_marked_invalid');
    if(!entry.valid&&entry.disposition==='valid') errors.push('invalid_attestation_entry_marked_valid');
  }
  if(request.registry.disposition==='empty'&&request.registry.entries.length>0) errors.push('empty_nested_attestation_registry_certificate_registry_attestation_registry_contains_entries');
  if(request.registry.disposition!=='empty'&&request.registry.entries.length===0&&request.registry.priorAttestationIds.length===0) errors.push('nonempty_nested_attestation_registry_certificate_registry_attestation_registry_missing_entries');
  if(request.registry.disposition==='complete'&&request.registry.entries.some(entry=>!entry.valid||entry.disposition==='invalid')) errors.push('complete_nested_attestation_registry_certificate_registry_attestation_registry_contains_invalid_entry');
  if(request.registry.disposition==='rejected'&&!request.registry.entries.some(entry=>!entry.valid||entry.disposition==='invalid')&&request.registry.rejectedAttestationIds.length===0) errors.push('rejected_nested_attestation_registry_certificate_registry_attestation_registry_missing_rejection');
  const uniqueErrors=[...new Set(errors)].sort();
  const disposition:HumanReviewNestedAttestationRegistryCertificateRegistryAttestationRegistryIntegrityDisposition=request.registry.entries.length===0&&uniqueErrors.length===0?'empty':uniqueErrors.length===0?'valid':'invalid';
  const base={schemaVersion:EAE_HUMAN_REVIEW_NESTED_ATTESTATION_REGISTRY_CERTIFICATE_REGISTRY_ATTESTATION_REGISTRY_INTEGRITY_SCHEMA_VERSION,tenant:request.tenant,registryId:request.registry.registryId,disposition,valid:uniqueErrors.length===0,errors:uniqueErrors,validatedAttestationIds:entries.map(entry=>entry.attestationId).sort(),evidenceRefs:[...new Set([...request.registry.evidenceRefs,...entries.flatMap(entry=>entry.evidenceRefs)])].sort(),truncated:request.registry.entries.length>request.maxEntries,readOnly:true as const,executable:false as const};
  return freeze({...base,validationId:`eae_nested_attestation_registry_certificate_registry_attestation_registry_integrity_${hash(base)}`});
}
