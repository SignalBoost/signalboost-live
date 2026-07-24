import type { TenantContext } from './types.ts';
import type { EnterpriseHumanReviewAttestationCertificateRegistryIntegrityResult } from './human-review-attestation-certificate-registry-integrity-validator.ts';

export const EAE_HUMAN_REVIEW_ATTESTATION_CERTIFICATE_REGISTRY_ATTESTATION_SCHEMA_VERSION = '1.0.0' as const;
export type HumanReviewAttestationCertificateRegistryAttestationDisposition = 'attested' | 'rejected' | 'empty';

export interface EnterpriseHumanReviewAttestationCertificateRegistryAttestationRequest {
  readonly tenant: TenantContext;
  readonly integrity: EnterpriseHumanReviewAttestationCertificateRegistryIntegrityResult;
  readonly attestorId: string;
  readonly statement: string;
  readonly evidenceRefs: readonly string[];
}

export interface EnterpriseHumanReviewAttestationCertificateRegistryAttestationSnapshot {
  readonly schemaVersion: typeof EAE_HUMAN_REVIEW_ATTESTATION_CERTIFICATE_REGISTRY_ATTESTATION_SCHEMA_VERSION;
  readonly attestationId: string;
  readonly tenant: TenantContext;
  readonly registryId: string;
  readonly validationId: string;
  readonly attestorId: string;
  readonly statement: string;
  readonly disposition: HumanReviewAttestationCertificateRegistryAttestationDisposition;
  readonly certificateIds: readonly string[];
  readonly evidenceRefs: readonly string[];
  readonly readOnly: true;
  readonly executable: false;
}

function tenantKey(t: TenantContext): string { return `${t.tenantId}:${t.environmentId}`; }
function canonical(v: unknown): string { if(Array.isArray(v)) return `[${v.map(canonical).join(',')}]`; if(v&&typeof v==='object') return `{${Object.entries(v as Record<string,unknown>).sort(([a],[b])=>a.localeCompare(b)).map(([k,x])=>`${JSON.stringify(k)}:${canonical(x)}`).join(',')}}`; const x=JSON.stringify(v); if(x===undefined) throw new Error('non_json_value_rejected'); return x; }
function hash(v: unknown): string { let h=2166136261; for(const c of canonical(v)){ h^=c.charCodeAt(0); h=Math.imul(h,16777619); } return (h>>>0).toString(16).padStart(8,'0'); }
function freeze<T>(v:T):T { if(!v||typeof v!=='object'||Object.isFrozen(v)) return v; Object.freeze(v); for(const x of Object.values(v as Record<string,unknown>)) freeze(x); return v; }

export function buildEnterpriseHumanReviewAttestationCertificateRegistryAttestation(request: EnterpriseHumanReviewAttestationCertificateRegistryAttestationRequest): EnterpriseHumanReviewAttestationCertificateRegistryAttestationSnapshot {
  if(!request.tenant.tenantId||!request.tenant.environmentId) throw new Error('tenant_required');
  if(tenantKey(request.integrity.tenant)!==tenantKey(request.tenant)) throw new Error('attestation_certificate_registry_integrity_tenant_boundary_violation');
  if(request.integrity.executable!==false||request.integrity.readOnly!==true) throw new Error('unsafe_attestation_certificate_registry_integrity_rejected');
  const attestorId=request.attestorId.trim();
  const statement=request.statement.trim();
  if(!attestorId) throw new Error('attestor_id_required');
  if(!statement) throw new Error('attestation_statement_required');
  if(attestorId.length>256||statement.length>2048) throw new Error('unbounded_certificate_registry_attestation_rejected');
  let disposition:HumanReviewAttestationCertificateRegistryAttestationDisposition='attested';
  if(request.integrity.disposition==='empty') disposition='empty';
  else if(!request.integrity.valid||request.integrity.disposition==='invalid') disposition='rejected';
  const base={schemaVersion:EAE_HUMAN_REVIEW_ATTESTATION_CERTIFICATE_REGISTRY_ATTESTATION_SCHEMA_VERSION,tenant:request.tenant,registryId:request.integrity.registryId,validationId:request.integrity.validationId,attestorId,statement,disposition,certificateIds:[...new Set(request.integrity.validatedCertificateIds)].sort(),evidenceRefs:[...new Set([...request.integrity.evidenceRefs,...request.evidenceRefs])].sort(),readOnly:true as const,executable:false as const};
  return freeze({...base,attestationId:`eae_human_review_attestation_certificate_registry_attestation_${hash(base)}`});
}
