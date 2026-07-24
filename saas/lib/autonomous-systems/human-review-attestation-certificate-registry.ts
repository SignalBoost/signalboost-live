import type { TenantContext } from './types.ts';
import type { EnterpriseHumanReviewAttestationCertificateIntegrityResult } from './human-review-attestation-certificate-integrity-validator.ts';

export const EAE_HUMAN_REVIEW_ATTESTATION_CERTIFICATE_REGISTRY_SCHEMA_VERSION = '1.0.0' as const;
export type HumanReviewAttestationCertificateRegistryDisposition = 'complete' | 'partial' | 'rejected' | 'empty';

export interface EnterpriseHumanReviewAttestationCertificateRegistryRequest {
  readonly tenant: TenantContext;
  readonly certificates: readonly EnterpriseHumanReviewAttestationCertificateIntegrityResult[];
  readonly priorCertificateIds: readonly string[];
  readonly maxEntries: number;
}

export interface EnterpriseHumanReviewAttestationCertificateRegistryEntry {
  readonly certificateId: string;
  readonly certificateSerial: string;
  readonly validationId: string;
  readonly disposition: EnterpriseHumanReviewAttestationCertificateIntegrityResult['disposition'];
  readonly valid: boolean;
  readonly attestationIds: readonly string[];
  readonly evidenceRefs: readonly string[];
  readonly readOnly: true;
  readonly executable: false;
}

export interface EnterpriseHumanReviewAttestationCertificateRegistrySnapshot {
  readonly schemaVersion: typeof EAE_HUMAN_REVIEW_ATTESTATION_CERTIFICATE_REGISTRY_SCHEMA_VERSION;
  readonly registryId: string;
  readonly tenant: TenantContext;
  readonly disposition: HumanReviewAttestationCertificateRegistryDisposition;
  readonly entries: readonly EnterpriseHumanReviewAttestationCertificateRegistryEntry[];
  readonly priorCertificateIds: readonly string[];
  readonly evidenceRefs: readonly string[];
  readonly truncated: boolean;
  readonly readOnly: true;
  readonly executable: false;
}

function tenantKey(t: TenantContext): string { return `${t.tenantId}:${t.environmentId}`; }
function canonical(v: unknown): string { if(Array.isArray(v)) return `[${v.map(canonical).join(',')}]`; if(v&&typeof v==='object') return `{${Object.entries(v as Record<string,unknown>).sort(([a],[b])=>a.localeCompare(b)).map(([k,x])=>`${JSON.stringify(k)}:${canonical(x)}`).join(',')}}`; const x=JSON.stringify(v); if(x===undefined) throw new Error('non_json_value_rejected'); return x; }
function hash(v: unknown): string { let h=2166136261; for(const c of canonical(v)){ h^=c.charCodeAt(0); h=Math.imul(h,16777619); } return (h>>>0).toString(16).padStart(8,'0'); }
function freeze<T>(v:T):T { if(!v||typeof v!=='object'||Object.isFrozen(v)) return v; Object.freeze(v); for(const x of Object.values(v as Record<string,unknown>)) freeze(x); return v; }

export function buildEnterpriseHumanReviewAttestationCertificateRegistry(request: EnterpriseHumanReviewAttestationCertificateRegistryRequest): EnterpriseHumanReviewAttestationCertificateRegistrySnapshot {
  if(!request.tenant.tenantId||!request.tenant.environmentId) throw new Error('tenant_required');
  if(!Number.isInteger(request.maxEntries)||request.maxEntries<1||request.maxEntries>512) throw new Error('unbounded_attestation_certificate_registry_rejected');
  const prior=new Set(request.priorCertificateIds);
  if(prior.size!==request.priorCertificateIds.length) throw new Error('duplicate_prior_certificate_id');
  for(const certificate of request.certificates){
    if(tenantKey(certificate.tenant)!==tenantKey(request.tenant)) throw new Error('attestation_certificate_integrity_tenant_boundary_violation');
    if(certificate.executable!==false||certificate.readOnly!==true) throw new Error('unsafe_attestation_certificate_integrity_rejected');
  }
  const candidates=request.certificates.filter(certificate=>!prior.has(certificate.certificateId)).map(certificate=>({certificateId:certificate.certificateId,certificateSerial:certificate.certificateSerial,validationId:certificate.validationId,disposition:certificate.disposition,valid:certificate.valid,attestationIds:[...new Set(certificate.validatedAttestationIds)].sort(),evidenceRefs:[...new Set(certificate.evidenceRefs)].sort(),readOnly:true as const,executable:false as const})).sort((a,b)=>a.certificateId.localeCompare(b.certificateId));
  if(new Set(candidates.map(entry=>entry.certificateId)).size!==candidates.length) throw new Error('duplicate_certificate_id');
  const entries=candidates.slice(0,request.maxEntries);
  let disposition:HumanReviewAttestationCertificateRegistryDisposition='complete';
  if(entries.length===0&&request.certificates.length===0) disposition='empty';
  else if(entries.some(entry=>!entry.valid||entry.disposition==='invalid')) disposition='rejected';
  else if(entries.some(entry=>entry.disposition==='empty')||candidates.length>request.maxEntries) disposition='partial';
  const base={schemaVersion:EAE_HUMAN_REVIEW_ATTESTATION_CERTIFICATE_REGISTRY_SCHEMA_VERSION,tenant:request.tenant,disposition,entries,priorCertificateIds:[...prior].sort(),evidenceRefs:[...new Set(entries.flatMap(entry=>entry.evidenceRefs))].sort(),truncated:candidates.length>request.maxEntries,readOnly:true as const,executable:false as const};
  return freeze({...base,registryId:`eae_human_review_attestation_certificate_registry_${hash(base)}`});
}
