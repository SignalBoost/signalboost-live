import type { TenantContext } from './types.ts';
import type { EnterpriseHumanReviewNestedAttestationRegistryCertificateV2IntegrityResult } from './human-review-attestation-certificate-registry-attestation-registry-certificate-registry-attestation-registry-certificate-registry-attestation-registry-certificate-registry-attestation-registry-certificate-integrity-validator.ts';

export const EAE_HUMAN_REVIEW_NESTED_ATTESTATION_REGISTRY_CERTIFICATE_V2_REGISTRY_SCHEMA_VERSION = '1.0.0' as const;
export type HumanReviewNestedAttestationRegistryCertificateV2RegistryDisposition = 'complete' | 'partial' | 'rejected' | 'empty';

export interface EnterpriseHumanReviewNestedAttestationRegistryCertificateV2RegistryRequest {
  readonly tenant: TenantContext;
  readonly integrityResults: readonly EnterpriseHumanReviewNestedAttestationRegistryCertificateV2IntegrityResult[];
  readonly priorCertificateIds: readonly string[];
  readonly maxEntries: number;
}

export interface EnterpriseHumanReviewNestedAttestationRegistryCertificateV2RegistryEntry {
  readonly certificateId: string;
  readonly certificateSerial: string;
  readonly sourceRegistryId: string;
  readonly validationId: string;
  readonly sourceValidationId: string;
  readonly issuerId: string;
  readonly disposition: EnterpriseHumanReviewNestedAttestationRegistryCertificateV2IntegrityResult['disposition'];
  readonly valid: boolean;
  readonly attestationIds: readonly string[];
  readonly evidenceRefs: readonly string[];
  readonly readOnly: true;
  readonly executable: false;
}

export interface EnterpriseHumanReviewNestedAttestationRegistryCertificateV2RegistrySnapshot {
  readonly schemaVersion: typeof EAE_HUMAN_REVIEW_NESTED_ATTESTATION_REGISTRY_CERTIFICATE_V2_REGISTRY_SCHEMA_VERSION;
  readonly registryId: string;
  readonly tenant: TenantContext;
  readonly disposition: HumanReviewNestedAttestationRegistryCertificateV2RegistryDisposition;
  readonly entries: readonly EnterpriseHumanReviewNestedAttestationRegistryCertificateV2RegistryEntry[];
  readonly priorCertificateIds: readonly string[];
  readonly rejectedCertificateIds: readonly string[];
  readonly evidenceRefs: readonly string[];
  readonly truncated: boolean;
  readonly readOnly: true;
  readonly executable: false;
}

function tenantKey(tenant: TenantContext): string { return `${tenant.tenantId}:${tenant.environmentId}`; }
function canonical(value: unknown): string { if(Array.isArray(value)) return `[${value.map(canonical).join(',')}]`; if(value&&typeof value==='object') return `{${Object.entries(value as Record<string,unknown>).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>`${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`; const encoded=JSON.stringify(value); if(encoded===undefined) throw new Error('non_json_value_rejected'); return encoded; }
function hash(value: unknown): string { let result=2166136261; for(const character of canonical(value)){ result^=character.charCodeAt(0); result=Math.imul(result,16777619); } return (result>>>0).toString(16).padStart(8,'0'); }
function freeze<T>(value:T):T { if(!value||typeof value!=='object'||Object.isFrozen(value)) return value; Object.freeze(value); for(const item of Object.values(value as Record<string,unknown>)) freeze(item); return value; }

export function buildEnterpriseHumanReviewNestedAttestationRegistryCertificateV2Registry(request: EnterpriseHumanReviewNestedAttestationRegistryCertificateV2RegistryRequest): EnterpriseHumanReviewNestedAttestationRegistryCertificateV2RegistrySnapshot {
  if(!request.tenant.tenantId||!request.tenant.environmentId) throw new Error('tenant_required');
  if(!Number.isInteger(request.maxEntries)||request.maxEntries<1||request.maxEntries>512) throw new Error('unbounded_nested_attestation_registry_certificate_v2_registry_rejected');
  const priorCertificateIds=[...new Set(request.priorCertificateIds)].sort();
  const prior=new Set(priorCertificateIds);
  const seenIds=new Set<string>();
  const seenSerials=new Set<string>();
  const rejectedCertificateIds:string[]=[];
  const entries:EnterpriseHumanReviewNestedAttestationRegistryCertificateV2RegistryEntry[]=[];
  for(const result of request.integrityResults){
    if(tenantKey(result.tenant)!==tenantKey(request.tenant)) throw new Error('nested_attestation_registry_certificate_v2_integrity_tenant_boundary_violation');
    if(result.executable!==false||result.readOnly!==true) throw new Error('unsafe_nested_attestation_registry_certificate_v2_integrity_rejected');
    const duplicate=!result.certificateId||seenIds.has(result.certificateId)||seenSerials.has(result.certificateSerial)||prior.has(result.certificateId);
    if(duplicate){ if(result.certificateId) rejectedCertificateIds.push(result.certificateId); continue; }
    seenIds.add(result.certificateId);
    seenSerials.add(result.certificateSerial);
    if(entries.length>=request.maxEntries) continue;
    entries.push({certificateId:result.certificateId,certificateSerial:result.certificateSerial,sourceRegistryId:result.registryId,validationId:result.validationId,sourceValidationId:result.sourceValidationId,issuerId:result.issuerId,disposition:result.disposition,valid:result.valid,attestationIds:[...new Set(result.validatedAttestationIds)].sort(),evidenceRefs:[...new Set(result.evidenceRefs)].sort(),readOnly:true,executable:false});
  }
  entries.sort((a,b)=>a.certificateId.localeCompare(b.certificateId));
  const hasInvalid=entries.some(entry=>!entry.valid||entry.disposition==='invalid')||rejectedCertificateIds.length>0;
  const hasValid=entries.some(entry=>entry.valid&&entry.disposition!=='invalid');
  const disposition:HumanReviewNestedAttestationRegistryCertificateV2RegistryDisposition=entries.length===0&&priorCertificateIds.length===0?'empty':hasInvalid&&!hasValid?'rejected':hasInvalid?'partial':'complete';
  const eligibleCount=request.integrityResults.filter(result=>result.certificateId&&!prior.has(result.certificateId)).length;
  const base={schemaVersion:EAE_HUMAN_REVIEW_NESTED_ATTESTATION_REGISTRY_CERTIFICATE_V2_REGISTRY_SCHEMA_VERSION,tenant:request.tenant,disposition,entries,priorCertificateIds,rejectedCertificateIds:[...new Set(rejectedCertificateIds)].sort(),evidenceRefs:[...new Set(entries.flatMap(entry=>entry.evidenceRefs))].sort(),truncated:eligibleCount>request.maxEntries,readOnly:true as const,executable:false as const};
  return freeze({...base,registryId:`eae_nested_attestation_registry_certificate_v2_registry_${hash(base)}`});
}
