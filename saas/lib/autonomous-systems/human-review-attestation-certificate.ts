import type { TenantContext } from './types.ts';
import type { EnterpriseHumanReviewAttestationRegistryIntegrityResult } from './human-review-attestation-registry-integrity-validator.ts';

export const EAE_HUMAN_REVIEW_ATTESTATION_CERTIFICATE_SCHEMA_VERSION = '1.0.0' as const;
export type HumanReviewAttestationCertificateDisposition = 'certified' | 'rejected' | 'empty';

export interface EnterpriseHumanReviewAttestationCertificateRequest {
  readonly tenant: TenantContext;
  readonly integrity: EnterpriseHumanReviewAttestationRegistryIntegrityResult;
  readonly issuerId: string;
  readonly certificateLabel: string;
  readonly evidenceRefs: readonly string[];
}

export interface EnterpriseHumanReviewAttestationCertificateSnapshot {
  readonly schemaVersion: typeof EAE_HUMAN_REVIEW_ATTESTATION_CERTIFICATE_SCHEMA_VERSION;
  readonly certificateId: string;
  readonly certificateSerial: string;
  readonly tenant: TenantContext;
  readonly registryId: string;
  readonly validationId: string;
  readonly issuerId: string;
  readonly certificateLabel: string;
  readonly disposition: HumanReviewAttestationCertificateDisposition;
  readonly attestationIds: readonly string[];
  readonly evidenceRefs: readonly string[];
  readonly readOnly: true;
  readonly executable: false;
}

function tenantKey(t: TenantContext): string { return `${t.tenantId}:${t.environmentId}`; }
function canonical(v: unknown): string { if(Array.isArray(v)) return `[${v.map(canonical).join(',')}]`; if(v&&typeof v==='object') return `{${Object.entries(v as Record<string,unknown>).sort(([a],[b])=>a.localeCompare(b)).map(([k,x])=>`${JSON.stringify(k)}:${canonical(x)}`).join(',')}}`; const x=JSON.stringify(v); if(x===undefined) throw new Error('non_json_value_rejected'); return x; }
function hash(v: unknown): string { let h=2166136261; for(const c of canonical(v)){ h^=c.charCodeAt(0); h=Math.imul(h,16777619); } return (h>>>0).toString(16).padStart(8,'0'); }
function freeze<T>(v:T):T { if(!v||typeof v!=='object'||Object.isFrozen(v)) return v; Object.freeze(v); for(const x of Object.values(v as Record<string,unknown>)) freeze(x); return v; }

export function buildEnterpriseHumanReviewAttestationCertificate(request: EnterpriseHumanReviewAttestationCertificateRequest): EnterpriseHumanReviewAttestationCertificateSnapshot {
  if(!request.tenant.tenantId||!request.tenant.environmentId) throw new Error('tenant_required');
  if(tenantKey(request.integrity.tenant)!==tenantKey(request.tenant)) throw new Error('attestation_registry_integrity_tenant_boundary_violation');
  if(request.integrity.executable!==false||request.integrity.readOnly!==true) throw new Error('unsafe_attestation_registry_integrity_rejected');
  const issuerId=request.issuerId.trim();
  const certificateLabel=request.certificateLabel.trim();
  if(!issuerId) throw new Error('certificate_issuer_id_required');
  if(!certificateLabel) throw new Error('certificate_label_required');
  if(issuerId.length>256||certificateLabel.length>512) throw new Error('unbounded_attestation_certificate_rejected');
  let disposition:HumanReviewAttestationCertificateDisposition='certified';
  if(request.integrity.disposition==='empty') disposition='empty';
  else if(!request.integrity.valid||request.integrity.disposition==='invalid') disposition='rejected';
  const base={schemaVersion:EAE_HUMAN_REVIEW_ATTESTATION_CERTIFICATE_SCHEMA_VERSION,tenant:request.tenant,registryId:request.integrity.registryId,validationId:request.integrity.validationId,issuerId,certificateLabel,disposition,attestationIds:[...new Set(request.integrity.validatedAttestationIds)].sort(),evidenceRefs:[...new Set([...request.integrity.evidenceRefs,...request.evidenceRefs])].sort(),readOnly:true as const,executable:false as const};
  const digest=hash(base);
  return freeze({...base,certificateId:`eae_human_review_attestation_certificate_${digest}`,certificateSerial:`EAE-HRAC-${digest.toUpperCase()}`});
}
