import type { TenantContext } from './types.ts';
import type { EnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistryCertificateRegistryAttestationRegistryCertificateRegistryAttestationSnapshot } from './human-review-attestation-certificate-registry-attestation-registry-certificate-registry-attestation-registry-certificate-registry-attestation.ts';

export const EAE_HUMAN_REVIEW_ATTESTATION_CERTIFICATE_REGISTRY_ATTESTATION_REGISTRY_CERTIFICATE_REGISTRY_ATTESTATION_REGISTRY_CERTIFICATE_REGISTRY_ATTESTATION_INTEGRITY_SCHEMA_VERSION = '1.0.0' as const;
export type HumanReviewAttestationCertificateRegistryAttestationRegistryCertificateRegistryAttestationRegistryCertificateRegistryAttestationIntegrityDisposition = 'valid' | 'invalid' | 'empty';

export interface EnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistryCertificateRegistryAttestationRegistryCertificateRegistryAttestationIntegrityRequest {
  readonly tenant: TenantContext;
  readonly attestation: EnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistryCertificateRegistryAttestationRegistryCertificateRegistryAttestationSnapshot;
  readonly expectedAttestorId?: string;
  readonly maxCertificateIds: number;
}

export interface EnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistryCertificateRegistryAttestationRegistryCertificateRegistryAttestationIntegrityResult {
  readonly schemaVersion: typeof EAE_HUMAN_REVIEW_ATTESTATION_CERTIFICATE_REGISTRY_ATTESTATION_REGISTRY_CERTIFICATE_REGISTRY_ATTESTATION_REGISTRY_CERTIFICATE_REGISTRY_ATTESTATION_INTEGRITY_SCHEMA_VERSION;
  readonly validationId: string;
  readonly tenant: TenantContext;
  readonly attestationId: string;
  readonly registryId: string;
  readonly sourceValidationId: string;
  readonly attestorId: string;
  readonly disposition: HumanReviewAttestationCertificateRegistryAttestationRegistryCertificateRegistryAttestationRegistryCertificateRegistryAttestationIntegrityDisposition;
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly validatedCertificateIds: readonly string[];
  readonly evidenceRefs: readonly string[];
  readonly truncated: boolean;
  readonly readOnly: true;
  readonly executable: false;
}

function tenantKey(t: TenantContext): string { return `${t.tenantId}:${t.environmentId}`; }
function canonical(v: unknown): string { if(Array.isArray(v)) return `[${v.map(canonical).join(',')}]`; if(v&&typeof v==='object') return `{${Object.entries(v as Record<string,unknown>).sort(([a],[b])=>a.localeCompare(b)).map(([k,x])=>`${JSON.stringify(k)}:${canonical(x)}`).join(',')}}`; const x=JSON.stringify(v); if(x===undefined) throw new Error('non_json_value_rejected'); return x; }
function hash(v: unknown): string { let h=2166136261; for(const c of canonical(v)){ h^=c.charCodeAt(0); h=Math.imul(h,16777619); } return (h>>>0).toString(16).padStart(8,'0'); }
function freeze<T>(v:T):T { if(!v||typeof v!=='object'||Object.isFrozen(v)) return v; Object.freeze(v); for(const x of Object.values(v as Record<string,unknown>)) freeze(x); return v; }

export function validateEnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistryCertificateRegistryAttestationRegistryCertificateRegistryAttestationIntegrity(request: EnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistryCertificateRegistryAttestationRegistryCertificateRegistryAttestationIntegrityRequest): EnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistryCertificateRegistryAttestationRegistryCertificateRegistryAttestationIntegrityResult {
  if(!request.tenant.tenantId||!request.tenant.environmentId) throw new Error('tenant_required');
  if(!Number.isInteger(request.maxCertificateIds)||request.maxCertificateIds<1||request.maxCertificateIds>512) throw new Error('unbounded_nested_certificate_registry_attestation_integrity_validation_rejected');
  if(tenantKey(request.attestation.tenant)!==tenantKey(request.tenant)) throw new Error('nested_certificate_registry_attestation_tenant_boundary_violation');
  if(request.attestation.executable!==false||request.attestation.readOnly!==true) throw new Error('unsafe_nested_certificate_registry_attestation_rejected');
  const errors:string[]=[];
  const attestorId=request.attestation.attestorId.trim();
  const expectedAttestorId=request.expectedAttestorId?.trim();
  if(!request.attestation.attestationId||!request.attestation.registryId||!request.attestation.validationId) errors.push('nested_certificate_registry_attestation_identity_required');
  if(!attestorId) errors.push('attestor_id_required');
  if(expectedAttestorId&&attestorId!==expectedAttestorId) errors.push('attestor_id_mismatch');
  const certificateIds=request.attestation.certificateIds.slice(0,request.maxCertificateIds);
  if(new Set(certificateIds).size!==certificateIds.length) errors.push('duplicate_certificate_id');
  if(request.attestation.disposition==='empty'&&request.attestation.certificateIds.length>0) errors.push('empty_attestation_contains_certificates');
  if(request.attestation.disposition==='attested'&&request.attestation.certificateIds.length===0) errors.push('attested_attestation_missing_certificates');
  const uniqueErrors=[...new Set(errors)].sort();
  const disposition:HumanReviewAttestationCertificateRegistryAttestationRegistryCertificateRegistryAttestationRegistryCertificateRegistryAttestationIntegrityDisposition=request.attestation.disposition==='empty'&&uniqueErrors.length===0?'empty':uniqueErrors.length===0?'valid':'invalid';
  const base={schemaVersion:EAE_HUMAN_REVIEW_ATTESTATION_CERTIFICATE_REGISTRY_ATTESTATION_REGISTRY_CERTIFICATE_REGISTRY_ATTESTATION_REGISTRY_CERTIFICATE_REGISTRY_ATTESTATION_INTEGRITY_SCHEMA_VERSION,tenant:request.tenant,attestationId:request.attestation.attestationId,registryId:request.attestation.registryId,sourceValidationId:request.attestation.validationId,attestorId,disposition,valid:uniqueErrors.length===0,errors:uniqueErrors,validatedCertificateIds:[...certificateIds].sort(),evidenceRefs:[...new Set(request.attestation.evidenceRefs)].sort(),truncated:request.attestation.certificateIds.length>request.maxCertificateIds,readOnly:true as const,executable:false as const};
  return freeze({...base,validationId:`eae_nested_certificate_registry_attestation_integrity_${hash(base)}`});
}
