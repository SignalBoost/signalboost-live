import type { TenantContext } from './types.ts';
import type { EnterpriseHumanReviewNestedAttestationRegistryCertificateRegistryIntegrityResult } from './human-review-attestation-certificate-registry-attestation-registry-certificate-registry-attestation-registry-certificate-registry-attestation-registry-certificate-registry-integrity-validator.ts';

export const EAE_HUMAN_REVIEW_NESTED_ATTESTATION_REGISTRY_CERTIFICATE_REGISTRY_ATTESTATION_SCHEMA_VERSION = '1.0.0' as const;
export type HumanReviewNestedAttestationRegistryCertificateRegistryAttestationDisposition = 'attested' | 'rejected' | 'empty';

export interface EnterpriseHumanReviewNestedAttestationRegistryCertificateRegistryAttestationRequest {
  readonly tenant: TenantContext;
  readonly integrity: EnterpriseHumanReviewNestedAttestationRegistryCertificateRegistryIntegrityResult;
  readonly attestorId: string;
  readonly evidenceRefs: readonly string[];
}

export interface EnterpriseHumanReviewNestedAttestationRegistryCertificateRegistryAttestationSnapshot {
  readonly schemaVersion: typeof EAE_HUMAN_REVIEW_NESTED_ATTESTATION_REGISTRY_CERTIFICATE_REGISTRY_ATTESTATION_SCHEMA_VERSION;
  readonly attestationId: string;
  readonly tenant: TenantContext;
  readonly registryId: string;
  readonly validationId: string;
  readonly attestorId: string;
  readonly disposition: HumanReviewNestedAttestationRegistryCertificateRegistryAttestationDisposition;
  readonly certificateIds: readonly string[];
  readonly evidenceRefs: readonly string[];
  readonly readOnly: true;
  readonly executable: false;
}

function tenantKey(t: TenantContext): string { return `${t.tenantId}:${t.environmentId}`; }
function canonical(v: unknown): string { if(Array.isArray(v)) return `[${v.map(canonical).join(',')}]`; if(v&&typeof v==='object') return `{${Object.entries(v as Record<string,unknown>).sort(([a],[b])=>a.localeCompare(b)).map(([k,x])=>`${JSON.stringify(k)}:${canonical(x)}`).join(',')}}`; const x=JSON.stringify(v); if(x===undefined) throw new Error('non_json_value_rejected'); return x; }
function hash(v: unknown): string { let h=2166136261; for(const c of canonical(v)){ h^=c.charCodeAt(0); h=Math.imul(h,16777619); } return (h>>>0).toString(16).padStart(8,'0'); }
function freeze<T>(v:T):T { if(!v||typeof v!=='object'||Object.isFrozen(v)) return v; Object.freeze(v); for(const x of Object.values(v as Record<string,unknown>)) freeze(x); return v; }

export function buildEnterpriseHumanReviewNestedAttestationRegistryCertificateRegistryAttestation(request: EnterpriseHumanReviewNestedAttestationRegistryCertificateRegistryAttestationRequest): EnterpriseHumanReviewNestedAttestationRegistryCertificateRegistryAttestationSnapshot {
  if(!request.tenant.tenantId||!request.tenant.environmentId) throw new Error('tenant_required');
  if(tenantKey(request.integrity.tenant)!==tenantKey(request.tenant)) throw new Error('nested_attestation_registry_certificate_registry_integrity_tenant_boundary_violation');
  if(request.integrity.executable!==false||request.integrity.readOnly!==true) throw new Error('unsafe_nested_attestation_registry_certificate_registry_integrity_rejected');
  const attestorId=request.attestorId.trim();
  if(!attestorId) throw new Error('attestor_id_required');
  if(attestorId.length>256) throw new Error('unbounded_nested_attestation_registry_certificate_registry_attestation_rejected');
  const disposition:HumanReviewNestedAttestationRegistryCertificateRegistryAttestationDisposition=request.integrity.disposition==='empty'?'empty':request.integrity.valid&&request.integrity.disposition==='valid'?'attested':'rejected';
  const base={schemaVersion:EAE_HUMAN_REVIEW_NESTED_ATTESTATION_REGISTRY_CERTIFICATE_REGISTRY_ATTESTATION_SCHEMA_VERSION,tenant:request.tenant,registryId:request.integrity.registryId,validationId:request.integrity.validationId,attestorId,disposition,certificateIds:[...new Set(request.integrity.validatedCertificateIds)].sort(),evidenceRefs:[...new Set([...request.integrity.evidenceRefs,...request.evidenceRefs])].sort(),readOnly:true as const,executable:false as const};
  return freeze({...base,attestationId:`eae_nested_attestation_registry_certificate_registry_attestation_${hash(base)}`});
}
