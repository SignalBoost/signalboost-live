import type { TenantContext } from './types.ts';
import type { EnterpriseHumanReviewAttestationCertificateSnapshot } from './human-review-attestation-certificate.ts';

export const EAE_HUMAN_REVIEW_ATTESTATION_CERTIFICATE_INTEGRITY_SCHEMA_VERSION = '1.0.0' as const;
export type HumanReviewAttestationCertificateIntegrityDisposition = 'valid' | 'invalid' | 'empty';

export interface EnterpriseHumanReviewAttestationCertificateIntegrityRequest {
  readonly tenant: TenantContext;
  readonly certificate: EnterpriseHumanReviewAttestationCertificateSnapshot;
  readonly maxAttestationIds: number;
}

export interface EnterpriseHumanReviewAttestationCertificateIntegrityResult {
  readonly schemaVersion: typeof EAE_HUMAN_REVIEW_ATTESTATION_CERTIFICATE_INTEGRITY_SCHEMA_VERSION;
  readonly validationId: string;
  readonly tenant: TenantContext;
  readonly certificateId: string;
  readonly certificateSerial: string;
  readonly disposition: HumanReviewAttestationCertificateIntegrityDisposition;
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

export function validateEnterpriseHumanReviewAttestationCertificateIntegrity(request: EnterpriseHumanReviewAttestationCertificateIntegrityRequest): EnterpriseHumanReviewAttestationCertificateIntegrityResult {
  if(!request.tenant.tenantId||!request.tenant.environmentId) throw new Error('tenant_required');
  if(!Number.isInteger(request.maxAttestationIds)||request.maxAttestationIds<1||request.maxAttestationIds>512) throw new Error('unbounded_attestation_certificate_integrity_validation_rejected');
  if(tenantKey(request.certificate.tenant)!==tenantKey(request.tenant)) throw new Error('attestation_certificate_tenant_boundary_violation');
  if(request.certificate.executable!==false||request.certificate.readOnly!==true) throw new Error('unsafe_attestation_certificate_rejected');
  const errors:string[]=[];
  if(!request.certificate.certificateId||!request.certificate.validationId||!request.certificate.registryId||!request.certificate.issuerId||!request.certificate.certificateLabel) errors.push('attestation_certificate_identity_required');
  if(!/^EAE-HRAC-[0-9A-F]{8}$/.test(request.certificate.certificateSerial)) errors.push('invalid_attestation_certificate_serial');
  const expectedDigest=request.certificate.certificateId.replace('eae_human_review_attestation_certificate_','').toUpperCase();
  if(request.certificate.certificateSerial!==`EAE-HRAC-${expectedDigest}`) errors.push('attestation_certificate_serial_mismatch');
  const ids=request.certificate.attestationIds.slice(0,request.maxAttestationIds);
  if(new Set(ids).size!==ids.length) errors.push('duplicate_attestation_id');
  if(request.certificate.disposition==='empty'&&request.certificate.attestationIds.length>0) errors.push('empty_certificate_contains_attestations');
  if(request.certificate.disposition==='certified'&&request.certificate.attestationIds.length===0) errors.push('certified_certificate_missing_attestations');
  const uniqueErrors=[...new Set(errors)].sort();
  const disposition:HumanReviewAttestationCertificateIntegrityDisposition=request.certificate.disposition==='empty'&&uniqueErrors.length===0?'empty':uniqueErrors.length===0?'valid':'invalid';
  const base={schemaVersion:EAE_HUMAN_REVIEW_ATTESTATION_CERTIFICATE_INTEGRITY_SCHEMA_VERSION,tenant:request.tenant,certificateId:request.certificate.certificateId,certificateSerial:request.certificate.certificateSerial,disposition,valid:uniqueErrors.length===0,errors:uniqueErrors,validatedAttestationIds:[...ids].sort(),evidenceRefs:[...new Set(request.certificate.evidenceRefs)].sort(),truncated:request.certificate.attestationIds.length>request.maxAttestationIds,readOnly:true as const,executable:false as const};
  return freeze({...base,validationId:`eae_human_review_attestation_certificate_integrity_${hash(base)}`});
}
