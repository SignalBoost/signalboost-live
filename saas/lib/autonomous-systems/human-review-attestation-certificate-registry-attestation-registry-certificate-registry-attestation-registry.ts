import type { TenantContext } from './types.ts';
import type { EnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistryCertificateRegistryAttestationIntegrityResult } from './human-review-attestation-certificate-registry-attestation-registry-certificate-registry-attestation-integrity-validator.ts';

export const EAE_HUMAN_REVIEW_ATTESTATION_CERTIFICATE_REGISTRY_ATTESTATION_REGISTRY_CERTIFICATE_REGISTRY_ATTESTATION_REGISTRY_SCHEMA_VERSION = '1.0.0' as const;
export type HumanReviewAttestationCertificateRegistryAttestationRegistryCertificateRegistryAttestationRegistryDisposition = 'complete' | 'partial' | 'rejected' | 'empty';

export interface EnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistryCertificateRegistryAttestationRegistryRequest {
  readonly tenant: TenantContext;
  readonly integrityResults: readonly EnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistryCertificateRegistryAttestationIntegrityResult[];
  readonly priorAttestationIds: readonly string[];
  readonly maxEntries: number;
}

export interface EnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistryCertificateRegistryAttestationRegistryEntry {
  readonly attestationId: string;
  readonly registryId: string;
  readonly validationId: string;
  readonly disposition: EnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistryCertificateRegistryAttestationIntegrityResult['disposition'];
  readonly valid: boolean;
  readonly certificateIds: readonly string[];
  readonly evidenceRefs: readonly string[];
  readonly readOnly: true;
  readonly executable: false;
}

export interface EnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistryCertificateRegistryAttestationRegistrySnapshot {
  readonly schemaVersion: typeof EAE_HUMAN_REVIEW_ATTESTATION_CERTIFICATE_REGISTRY_ATTESTATION_REGISTRY_CERTIFICATE_REGISTRY_ATTESTATION_REGISTRY_SCHEMA_VERSION;
  readonly registryId: string;
  readonly tenant: TenantContext;
  readonly disposition: HumanReviewAttestationCertificateRegistryAttestationRegistryCertificateRegistryAttestationRegistryDisposition;
  readonly entries: readonly EnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistryCertificateRegistryAttestationRegistryEntry[];
  readonly priorAttestationIds: readonly string[];
  readonly rejectedAttestationIds: readonly string[];
  readonly evidenceRefs: readonly string[];
  readonly truncated: boolean;
  readonly readOnly: true;
  readonly executable: false;
}

function tenantKey(t: TenantContext): string { return `${t.tenantId}:${t.environmentId}`; }
function canonical(v: unknown): string { if(Array.isArray(v)) return `[${v.map(canonical).join(',')}]`; if(v&&typeof v==='object') return `{${Object.entries(v as Record<string,unknown>).sort(([a],[b])=>a.localeCompare(b)).map(([k,x])=>`${JSON.stringify(k)}:${canonical(x)}`).join(',')}}`; const x=JSON.stringify(v); if(x===undefined) throw new Error('non_json_value_rejected'); return x; }
function hash(v: unknown): string { let h=2166136261; for(const c of canonical(v)){ h^=c.charCodeAt(0); h=Math.imul(h,16777619); } return (h>>>0).toString(16).padStart(8,'0'); }
function freeze<T>(v:T):T { if(!v||typeof v!=='object'||Object.isFrozen(v)) return v; Object.freeze(v); for(const x of Object.values(v as Record<string,unknown>)) freeze(x); return v; }

export function buildEnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistryCertificateRegistryAttestationRegistry(request: EnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistryCertificateRegistryAttestationRegistryRequest): EnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistryCertificateRegistryAttestationRegistrySnapshot {
  if(!request.tenant.tenantId||!request.tenant.environmentId) throw new Error('tenant_required');
  if(!Number.isInteger(request.maxEntries)||request.maxEntries<1||request.maxEntries>512) throw new Error('unbounded_certificate_registry_attestation_registry_certificate_registry_attestation_registry_rejected');
  const priorAttestationIds=[...new Set(request.priorAttestationIds)].sort();
  const prior=new Set(priorAttestationIds);
  const seen=new Set<string>();
  const rejectedAttestationIds:string[]=[];
  const entries:EnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistryCertificateRegistryAttestationRegistryEntry[]=[];
  for(const result of request.integrityResults){
    if(tenantKey(result.tenant)!==tenantKey(request.tenant)) throw new Error('certificate_registry_attestation_registry_certificate_registry_attestation_integrity_tenant_boundary_violation');
    if(result.executable!==false||result.readOnly!==true) throw new Error('unsafe_certificate_registry_attestation_registry_certificate_registry_attestation_integrity_rejected');
    if(!result.attestationId||seen.has(result.attestationId)||prior.has(result.attestationId)){ if(result.attestationId) rejectedAttestationIds.push(result.attestationId); continue; }
    seen.add(result.attestationId);
    if(entries.length>=request.maxEntries) continue;
    entries.push({attestationId:result.attestationId,registryId:result.registryId,validationId:result.validationId,disposition:result.disposition,valid:result.valid,certificateIds:[...new Set(result.validatedCertificateIds)].sort(),evidenceRefs:[...new Set(result.evidenceRefs)].sort(),readOnly:true,executable:false});
  }
  entries.sort((a,b)=>a.attestationId.localeCompare(b.attestationId));
  const hasInvalid=entries.some(entry=>!entry.valid||entry.disposition==='invalid')||rejectedAttestationIds.length>0;
  const hasValid=entries.some(entry=>entry.valid&&entry.disposition!=='invalid');
  const disposition:HumanReviewAttestationCertificateRegistryAttestationRegistryCertificateRegistryAttestationRegistryDisposition=entries.length===0&&priorAttestationIds.length===0?'empty':hasInvalid&&!hasValid?'rejected':hasInvalid?'partial':'complete';
  const base={schemaVersion:EAE_HUMAN_REVIEW_ATTESTATION_CERTIFICATE_REGISTRY_ATTESTATION_REGISTRY_CERTIFICATE_REGISTRY_ATTESTATION_REGISTRY_SCHEMA_VERSION,tenant:request.tenant,disposition,entries,priorAttestationIds,rejectedAttestationIds:[...new Set(rejectedAttestationIds)].sort(),evidenceRefs:[...new Set(entries.flatMap(entry=>entry.evidenceRefs))].sort(),truncated:request.integrityResults.filter(result=>!prior.has(result.attestationId)).length>request.maxEntries,readOnly:true as const,executable:false as const};
  return freeze({...base,registryId:`eae_human_review_attestation_certificate_registry_attestation_registry_certificate_registry_attestation_registry_${hash(base)}`});
}
