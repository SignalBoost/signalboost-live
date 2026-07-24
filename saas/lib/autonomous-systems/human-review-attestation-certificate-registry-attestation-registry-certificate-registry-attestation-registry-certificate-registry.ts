import type { TenantContext } from './types.ts';
import type { EnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistryCertificateRegistryAttestationRegistryCertificateIntegrityResult } from './human-review-attestation-certificate-registry-attestation-registry-certificate-registry-attestation-registry-certificate-integrity-validator.ts';

export const EAE_HUMAN_REVIEW_ATTESTATION_CERTIFICATE_REGISTRY_ATTESTATION_REGISTRY_CERTIFICATE_REGISTRY_ATTESTATION_REGISTRY_CERTIFICATE_REGISTRY_SCHEMA_VERSION = '1.0.0' as const;
export type HumanReviewAttestationCertificateRegistryAttestationRegistryCertificateRegistryAttestationRegistryCertificateRegistryDisposition = 'complete' | 'partial' | 'rejected' | 'empty';

export interface EnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistryCertificateRegistryAttestationRegistryCertificateRegistryRequest {
  readonly tenant: TenantContext;
  readonly integrityResults: readonly EnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistryCertificateRegistryAttestationRegistryCertificateIntegrityResult[];
  readonly priorCertificateIds: readonly string[];
  readonly maxEntries: number;
}

export interface EnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistryCertificateRegistryAttestationRegistryCertificateRegistryEntry {
  readonly certificateId: string;
  readonly certificateSerial: string;
  readonly registryId: string;
  readonly validationId: string;
  readonly issuerId: string;
  readonly disposition: EnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistryCertificateRegistryAttestationRegistryCertificateIntegrityResult['disposition'];
  readonly valid: boolean;
  readonly attestationIds: readonly string[];
  readonly evidenceRefs: readonly string[];
  readonly readOnly: true;
  readonly executable: false;
}

export interface EnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistryCertificateRegistryAttestationRegistryCertificateRegistrySnapshot {
  readonly schemaVersion: typeof EAE_HUMAN_REVIEW_ATTESTATION_CERTIFICATE_REGISTRY_ATTESTATION_REGISTRY_CERTIFICATE_REGISTRY_ATTESTATION_REGISTRY_CERTIFICATE_REGISTRY_SCHEMA_VERSION;
  readonly registryId: string;
  readonly tenant: TenantContext;
  readonly disposition: HumanReviewAttestationCertificateRegistryAttestationRegistryCertificateRegistryAttestationRegistryCertificateRegistryDisposition;
  readonly entries: readonly EnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistryCertificateRegistryAttestationRegistryCertificateRegistryEntry[];
  readonly priorCertificateIds: readonly string[];
  readonly rejectedCertificateIds: readonly string[];
  readonly evidenceRefs: readonly string[];
  readonly truncated: boolean;
  readonly readOnly: true;
  readonly executable: false;
}

function tenantKey(t: TenantContext): string { return `${t.tenantId}:${t.environmentId}`; }
function canonical(v: unknown): string { if(Array.isArray(v)) return `[${v.map(canonical).join(',')}]`; if(v&&typeof v==='object') return `{${Object.entries(v as Record<string,unknown>).sort(([a],[b])=>a.localeCompare(b)).map(([k,x])=>`${JSON.stringify(k)}:${canonical(x)}`).join(',')}}`; const x=JSON.stringify(v); if(x===undefined) throw new Error('non_json_value_rejected'); return x; }
function hash(v: unknown): string { let h=2166136261; for(const c of canonical(v)){ h^=c.charCodeAt(0); h=Math.imul(h,16777619); } return (h>>>0).toString(16).padStart(8,'0'); }
function freeze<T>(v:T):T { if(!v||typeof v!=='object'||Object.isFrozen(v)) return v; Object.freeze(v); for(const x of Object.values(v as Record<string,unknown>)) freeze(x); return v; }

export function buildEnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistryCertificateRegistryAttestationRegistryCertificateRegistry(request: EnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistryCertificateRegistryAttestationRegistryCertificateRegistryRequest): EnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistryCertificateRegistryAttestationRegistryCertificateRegistrySnapshot {
  if(!request.tenant.tenantId||!request.tenant.environmentId) throw new Error('tenant_required');
  if(!Number.isInteger(request.maxEntries)||request.maxEntries<1||request.maxEntries>512) throw new Error('unbounded_nested_certificate_registry_rejected');
  const priorCertificateIds=[...new Set(request.priorCertificateIds)].sort();
  const prior=new Set(priorCertificateIds);
  const seenIds=new Set<string>();
  const seenSerials=new Set<string>();
  const rejectedCertificateIds:string[]=[];
  const entries:EnterpriseHumanReviewAttestationCertificateRegistryAttestationRegistryCertificateRegistryAttestationRegistryCertificateRegistryEntry[]=[];
  for(const result of request.integrityResults){
    if(tenantKey(result.tenant)!==tenantKey(request.tenant)) throw new Error('nested_certificate_integrity_tenant_boundary_violation');
    if(result.executable!==false||result.readOnly!==true) throw new Error('unsafe_nested_certificate_integrity_rejected');
    const duplicate=!result.certificateId||seenIds.has(result.certificateId)||seenSerials.has(result.certificateSerial)||prior.has(result.certificateId);
    if(duplicate){ if(result.certificateId) rejectedCertificateIds.push(result.certificateId); continue; }
    seenIds.add(result.certificateId); seenSerials.add(result.certificateSerial);
    if(entries.length>=request.maxEntries) continue;
    entries.push({certificateId:result.certificateId,certificateSerial:result.certificateSerial,registryId:result.registryId,validationId:result.validationId,issuerId:result.issuerId,disposition:result.disposition,valid:result.valid,attestationIds:[...new Set(result.validatedAttestationIds)].sort(),evidenceRefs:[...new Set(result.evidenceRefs)].sort(),readOnly:true,executable:false});
  }
  entries.sort((a,b)=>a.certificateId.localeCompare(b.certificateId));
  const hasInvalid=entries.some(entry=>!entry.valid||entry.disposition==='invalid')||rejectedCertificateIds.length>0;
  const hasValid=entries.some(entry=>entry.valid&&entry.disposition!=='invalid');
  const disposition:HumanReviewAttestationCertificateRegistryAttestationRegistryCertificateRegistryAttestationRegistryCertificateRegistryDisposition=entries.length===0&&priorCertificateIds.length===0?'empty':hasInvalid&&!hasValid?'rejected':hasInvalid?'partial':'complete';
  const base={schemaVersion:EAE_HUMAN_REVIEW_ATTESTATION_CERTIFICATE_REGISTRY_ATTESTATION_REGISTRY_CERTIFICATE_REGISTRY_ATTESTATION_REGISTRY_CERTIFICATE_REGISTRY_SCHEMA_VERSION,tenant:request.tenant,disposition,entries,priorCertificateIds,rejectedCertificateIds:[...new Set(rejectedCertificateIds)].sort(),evidenceRefs:[...new Set(entries.flatMap(entry=>entry.evidenceRefs))].sort(),truncated:request.integrityResults.filter(result=>!prior.has(result.certificateId)).length>request.maxEntries,readOnly:true as const,executable:false as const};
  return freeze({...base,registryId:`eae_nested_certificate_registry_${hash(base)}`});
}
