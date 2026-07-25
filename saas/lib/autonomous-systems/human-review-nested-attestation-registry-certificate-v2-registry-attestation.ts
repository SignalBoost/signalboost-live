import { createHash } from 'node:crypto';
import type { TenantContext } from './types.ts';
import type { EnterpriseHumanReviewNestedAttestationRegistryCertificateV2RegistryIntegrityResult } from './human-review-nested-attestation-registry-certificate-v2-registry-integrity-validator.ts';

export const EAE_HUMAN_REVIEW_NESTED_ATTESTATION_REGISTRY_CERTIFICATE_V2_REGISTRY_ATTESTATION_SCHEMA_VERSION = '1.0.0' as const;
export type HumanReviewNestedAttestationRegistryCertificateV2RegistryAttestationDisposition = 'attested' | 'rejected' | 'empty';

export interface EnterpriseHumanReviewNestedAttestationRegistryCertificateV2RegistryAttestationRequest {
  readonly tenant: TenantContext;
  readonly integrity: EnterpriseHumanReviewNestedAttestationRegistryCertificateV2RegistryIntegrityResult;
  readonly attestorId: string;
  readonly statement: string;
  readonly evidenceRefs: readonly string[];
}

export interface EnterpriseHumanReviewNestedAttestationRegistryCertificateV2RegistryAttestationSnapshot {
  readonly schemaVersion: typeof EAE_HUMAN_REVIEW_NESTED_ATTESTATION_REGISTRY_CERTIFICATE_V2_REGISTRY_ATTESTATION_SCHEMA_VERSION;
  readonly attestationId: string;
  readonly tenant: TenantContext;
  readonly registryId: string;
  readonly validationId: string;
  readonly attestorId: string;
  readonly statement: string;
  readonly disposition: HumanReviewNestedAttestationRegistryCertificateV2RegistryAttestationDisposition;
  readonly certificateIds: readonly string[];
  readonly evidenceRefs: readonly string[];
  readonly sourceTruncated: boolean;
  readonly readOnly: true;
  readonly executable: false;
}

function sameTenant(left: TenantContext, right: TenantContext): boolean {
  return left.tenantId === right.tenantId && left.environmentId === right.environmentId;
}
function canonical(value: unknown): string { if(Array.isArray(value)) return `[${value.map(canonical).join(',')}]`; if(value&&typeof value==='object') return `{${Object.entries(value as Record<string,unknown>).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>`${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`; const encoded=JSON.stringify(value); if(encoded===undefined) throw new Error('non_json_value_rejected'); return encoded; }
function hash(value: unknown): string { return createHash('sha256').update(canonical(value),'utf8').digest('hex'); }
function freeze<T>(value:T):T { if(!value||typeof value!=='object'||Object.isFrozen(value)) return value; Object.freeze(value); for(const item of Object.values(value as Record<string,unknown>)) freeze(item); return value; }

export function buildEnterpriseHumanReviewNestedAttestationRegistryCertificateV2RegistryAttestation(request: EnterpriseHumanReviewNestedAttestationRegistryCertificateV2RegistryAttestationRequest): EnterpriseHumanReviewNestedAttestationRegistryCertificateV2RegistryAttestationSnapshot {
  if(!request.tenant.tenantId||!request.tenant.environmentId) throw new Error('tenant_required');
  if(!sameTenant(request.integrity.tenant,request.tenant)) throw new Error('nested_attestation_registry_certificate_v2_registry_integrity_tenant_boundary_violation');
  if(request.integrity.executable!==false||request.integrity.readOnly!==true) throw new Error('unsafe_nested_attestation_registry_certificate_v2_registry_integrity_rejected');
  const attestorId=request.attestorId.trim();
  const statement=request.statement.trim();
  if(!attestorId) throw new Error('attestor_id_required');
  if(!statement) throw new Error('attestation_statement_required');
  if(attestorId.length>256||statement.length>2048) throw new Error('unbounded_nested_attestation_registry_certificate_v2_registry_attestation_rejected');
  let disposition:HumanReviewNestedAttestationRegistryCertificateV2RegistryAttestationDisposition='attested';
  if(request.integrity.disposition==='empty') disposition='empty';
  else if(!request.integrity.valid||request.integrity.disposition==='invalid') disposition='rejected';
  const base={schemaVersion:EAE_HUMAN_REVIEW_NESTED_ATTESTATION_REGISTRY_CERTIFICATE_V2_REGISTRY_ATTESTATION_SCHEMA_VERSION,tenant:request.tenant,registryId:request.integrity.registryId,validationId:request.integrity.validationId,attestorId,statement,disposition,certificateIds:[...new Set(request.integrity.validatedCertificateIds)].sort(),evidenceRefs:[...new Set([...request.integrity.evidenceRefs,...request.evidenceRefs])].sort(),sourceTruncated:request.integrity.truncated,readOnly:true as const,executable:false as const};
  return freeze({...base,attestationId:`eae_nested_attestation_registry_certificate_v2_registry_attestation_${hash(base)}`});
}
