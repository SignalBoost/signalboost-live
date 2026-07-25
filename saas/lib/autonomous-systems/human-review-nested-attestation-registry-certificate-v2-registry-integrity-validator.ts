import type { TenantContext } from './types.ts';
import type { EnterpriseHumanReviewNestedAttestationRegistryCertificateV2RegistrySnapshot } from './human-review-nested-attestation-registry-certificate-v2-registry.ts';

export const EAE_HUMAN_REVIEW_NESTED_ATTESTATION_REGISTRY_CERTIFICATE_V2_REGISTRY_INTEGRITY_SCHEMA_VERSION = '1.0.0' as const;
export type HumanReviewNestedAttestationRegistryCertificateV2RegistryIntegrityDisposition = 'valid' | 'invalid' | 'empty';

export interface EnterpriseHumanReviewNestedAttestationRegistryCertificateV2RegistryIntegrityRequest {
  readonly tenant: TenantContext;
  readonly registry: EnterpriseHumanReviewNestedAttestationRegistryCertificateV2RegistrySnapshot;
  readonly maxEntries: number;
}

export interface EnterpriseHumanReviewNestedAttestationRegistryCertificateV2RegistryIntegrityResult {
  readonly schemaVersion: typeof EAE_HUMAN_REVIEW_NESTED_ATTESTATION_REGISTRY_CERTIFICATE_V2_REGISTRY_INTEGRITY_SCHEMA_VERSION;
  readonly validationId: string;
  readonly tenant: TenantContext;
  readonly registryId: string;
  readonly disposition: HumanReviewNestedAttestationRegistryCertificateV2RegistryIntegrityDisposition;
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly validatedCertificateIds: readonly string[];
  readonly evidenceRefs: readonly string[];
  readonly truncated: boolean;
  readonly readOnly: true;
  readonly executable: false;
}

function tenantKey(tenant: TenantContext): string { return `${tenant.tenantId}:${tenant.environmentId}`; }
function canonical(value: unknown): string { if(Array.isArray(value)) return `[${value.map(canonical).join(',')}]`; if(value&&typeof value==='object') return `{${Object.entries(value as Record<string,unknown>).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>`${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`; const encoded=JSON.stringify(value); if(encoded===undefined) throw new Error('non_json_value_rejected'); return encoded; }
function hash(value: unknown): string { let result=2166136261; for(const character of canonical(value)){ result^=character.charCodeAt(0); result=Math.imul(result,16777619); } return (result>>>0).toString(16).padStart(8,'0'); }
function freeze<T>(value:T):T { if(!value||typeof value!=='object'||Object.isFrozen(value)) return value; Object.freeze(value); for(const item of Object.values(value as Record<string,unknown>)) freeze(item); return value; }

export function validateEnterpriseHumanReviewNestedAttestationRegistryCertificateV2RegistryIntegrity(request: EnterpriseHumanReviewNestedAttestationRegistryCertificateV2RegistryIntegrityRequest): EnterpriseHumanReviewNestedAttestationRegistryCertificateV2RegistryIntegrityResult {
  if(!request.tenant.tenantId||!request.tenant.environmentId) throw new Error('tenant_required');
  if(!Number.isInteger(request.maxEntries)||request.maxEntries<1||request.maxEntries>512) throw new Error('unbounded_nested_attestation_registry_certificate_v2_registry_integrity_validation_rejected');
  if(tenantKey(request.registry.tenant)!==tenantKey(request.tenant)) throw new Error('nested_attestation_registry_certificate_v2_registry_tenant_boundary_violation');
  if(request.registry.executable!==false||request.registry.readOnly!==true) throw new Error('unsafe_nested_attestation_registry_certificate_v2_registry_rejected');

  const errors:string[]=[];
  if(!request.registry.registryId) errors.push('nested_attestation_registry_certificate_v2_registry_identity_required');
  const registryBase={schemaVersion:request.registry.schemaVersion,tenant:request.registry.tenant,disposition:request.registry.disposition,entries:request.registry.entries,priorCertificateIds:request.registry.priorCertificateIds,rejectedCertificateIds:request.registry.rejectedCertificateIds,evidenceRefs:request.registry.evidenceRefs,truncated:request.registry.truncated,readOnly:true as const,executable:false as const};
  const expectedRegistryId=`eae_nested_attestation_registry_certificate_v2_registry_${hash(registryBase)}`;
  if(request.registry.registryId!==expectedRegistryId) errors.push('registry_id_digest_mismatch');

  const entries=request.registry.entries.slice(0,request.maxEntries);
  const certificateIds=entries.map(entry=>entry.certificateId);
  const certificateSerials=entries.map(entry=>entry.certificateSerial);
  if(certificateIds.some(id=>!id)) errors.push('certificate_id_required');
  if(certificateSerials.some(serial=>!serial)) errors.push('certificate_serial_required');
  if(new Set(certificateIds).size!==certificateIds.length) errors.push('duplicate_certificate_id');
  if(new Set(certificateSerials).size!==certificateSerials.length) errors.push('duplicate_certificate_serial');
  if(entries.some(entry=>entry.executable!==false||entry.readOnly!==true)) errors.push('unsafe_registry_entry');
  if(entries.some(entry=>!entry.validationId||!entry.sourceValidationId||!entry.sourceRegistryId||!entry.issuerId)) errors.push('registry_entry_identity_required');
  if(entries.some(entry=>entry.valid!== (entry.disposition!=='invalid'))) errors.push('certificate_validity_disposition_mismatch');

  const prior=new Set(request.registry.priorCertificateIds);
  const rejected=new Set(request.registry.rejectedCertificateIds);
  if(certificateIds.some(id=>prior.has(id))) errors.push('prior_certificate_reincluded');
  if(certificateIds.some(id=>rejected.has(id))) errors.push('rejected_certificate_reincluded');
  if(request.registry.disposition==='empty'&&(entries.length>0||request.registry.priorCertificateIds.length>0)) errors.push('empty_registry_contains_certificates');
  if(request.registry.disposition==='complete'&&entries.some(entry=>!entry.valid||entry.disposition==='invalid')) errors.push('complete_registry_contains_invalid_certificate');
  if(request.registry.disposition==='rejected'&&entries.some(entry=>entry.valid&&entry.disposition!=='invalid')) errors.push('rejected_registry_contains_valid_certificate');

  const uniqueErrors=[...new Set(errors)].sort();
  const disposition:HumanReviewNestedAttestationRegistryCertificateV2RegistryIntegrityDisposition=request.registry.disposition==='empty'&&uniqueErrors.length===0?'empty':uniqueErrors.length===0?'valid':'invalid';
  const base={schemaVersion:EAE_HUMAN_REVIEW_NESTED_ATTESTATION_REGISTRY_CERTIFICATE_V2_REGISTRY_INTEGRITY_SCHEMA_VERSION,tenant:request.tenant,registryId:request.registry.registryId,disposition,valid:uniqueErrors.length===0,errors:uniqueErrors,validatedCertificateIds:[...certificateIds].sort(),evidenceRefs:[...new Set(request.registry.evidenceRefs)].sort(),truncated:request.registry.truncated||request.registry.entries.length>request.maxEntries,readOnly:true as const,executable:false as const};
  return freeze({...base,validationId:`eae_nested_attestation_registry_certificate_v2_registry_integrity_${hash(base)}`});
}
