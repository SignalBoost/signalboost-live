import type { TenantContext } from './types.ts';
import type { EnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistryCertificateRegistryAttestationRegistryCertificateSnapshot } from './human-review-attestation-certificate-registry-attestation-registry-certificate-registry-attestation-registry-certificate.ts';

export const EAE_HUMAN_REVIEW_ATTESTATION_CERTIFICATE_REGISTRY_ATTESTATION_REGISTRY_CERTIFICATE_REGISTRY_ATTESTATION_REGISTRY_CERTIFICATE_INTEGRITY_SCHEMA_VERSION = '1.0.0' as const;
export type HumanReviewAttestationCertificateRegistryAttestationRegistryCertificateRegistryAttestationRegistryCertificateIntegrityDisposition = 'valid' | 'invalid' | 'empty';

export interface EnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistryCertificateRegistryAttestationRegistryCertificateIntegrityRequest {
  readonly tenant: TenantContext;
  readonly certificate: EnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistryCertificateRegistryAttestationRegistryCertificateSnapshot;
  readonly expectedIssuerId?: string;
  readonly maxAttestationIds: number;
}

export interface EnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistryCertificateRegistryAttestationRegistryCertificateIntegrityResult {
  readonly schemaVersion: typeof EAE_HUMAN_REVIEW_ATTESTATION_CERTIFICATE_REGISTRY_ATTESTATION_REGISTRY_CERTIFICATE_REGISTRY_ATTESTATION_REGISTRY_CERTIFICATE_INTEGRITY_SCHEMA_VERSION;
  readonly validationId: string;
  readonly tenant: TenantContext;
  readonly certificateId: string;
  readonly certificateSerial: string;
  readonly disposition: HumanReviewAttestationCertificateRegistryAttestationRegistryCertificateRegistryAttestationRegistryCertificateIntegrityDisposition;
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

export function validateEnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistryCertificateRegistryAttestationRegistryCertificateIntegrity(request: EnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistryCertificateRegistryAttestationRegistryCertificateIntegrityRequest): EnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistryCertificateRegistryAttestationRegistryCertificateIntegrityResult {
  if(!request.tenant.tenantId||!request.tenant.environmentId) throw new Error('tenant_required');
  if(!Number.isInteger(request.maxAttestationIds)||request.maxAttestationIds<1||request.maxAttestationIds>512) throw new Error('unbounded_certificate_registry_attestation_registry_certificate_registry_attestation_registry_certificate_integrity_validation_rejected');
  if(tenantKey(request.certificate.tenant)!==tenantKey(request.tenant)) throw new Error('certificate_registry_attestation_registry_certificate_registry_attestation_registry_certificate_tenant_boundary_violation');
  if(request.certificate.executable!==false||request.certificate.readOnly!==true) throw new Error('unsafe_certificate_registry_attestation_registry_certificate_registry_attestation_registry_certificate_rejected');
  const errors:string[]=[];
  const issuerId=request.certificate.issuerId.trim();
  const expectedIssuerId=request.expectedIssuerId?.trim();
  if(!request.certificate.certificateId||!request.certificate.certificateSerial||!request.certificate.registryId||!request.certificate.validationId) errors.push('certificate_identity_required');
  if(!issuerId) errors.push('issuer_id_required');
  if(expectedIssuerId&&issuerId!==expectedIssuerId) errors.push('issuer_id_mismatch');
  if(!request.certificate.certificateSerial.startsWith('EAE-HRARR-')) errors.push('certificate_serial_prefix_invalid');
  const attestationIds=request.certificate.attestationIds.slice(0,request.maxAttestationIds);
  if(new Set(attestationIds).size!==attestationIds.length) errors.push('duplicate_attestation_id');
  if(request.certificate.disposition==='empty'&&request.certificate.attestationIds.length>0) errors.push('empty_certificate_contains_attestations');
  if(request.certificate.disposition==='certified'&&request.certificate.attestationIds.length===0) errors.push('certified_certificate_missing_attestations');
  const uniqueErrors=[...new Set(errors)].sort();
  const disposition:HumanReviewAttestationCertificateRegistryAttestationRegistryCertificateRegistryAttestationRegistryCertificateIntegrityDisposition=request.certificate.disposition==='empty'&&uniqueErrors.length===0?'empty':uniqueErrors.length===0?'valid':'invalid';
  const base={schemaVersion:EAE_HUMAN_REVIEW_ATTESTATION_CERTIFICATE_REGISTRY_ATTESTATION_REGISTRY_CERTIFICATE_REGISTRY_ATTESTATION_REGISTRY_CERTIFICATE_INTEGRITY_SCHEMA_VERSION,tenant:request.tenant,certificateId:request.certificate.certificateId,certificateSerial:request.certificate.certificateSerial,disposition,valid:uniqueErrors.length===0,errors:uniqueErrors,validatedAttestationIds:[...attestationIds].sort(),evidenceRefs:[...new Set(request.certificate.evidenceRefs)].sort(),truncated:request.certificate.attestationIds.length>request.maxAttestationIds,readOnly:true as const,executable:false as const};
  return freeze({...base,validationId:`eae_human_review_attestation_certificate_registry_attestation_registry_certificate_registry_attestation_registry_certificate_integrity_${hash(base)}`});
}
