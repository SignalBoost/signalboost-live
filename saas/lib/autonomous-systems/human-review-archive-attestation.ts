import type { TenantContext } from './types.ts';
import type { EnterpriseHumanReviewArchiveIntegrityResult } from './human-review-archive-integrity-validator.ts';

export const EAE_HUMAN_REVIEW_ARCHIVE_ATTESTATION_SCHEMA_VERSION = '1.0.0' as const;
export type HumanReviewArchiveAttestationDisposition = 'attested' | 'rejected' | 'empty';

export interface EnterpriseHumanReviewArchiveAttestationRequest {
  readonly tenant: TenantContext;
  readonly integrity: EnterpriseHumanReviewArchiveIntegrityResult;
  readonly attestorId: string;
  readonly statement: string;
  readonly evidenceRefs: readonly string[];
}

export interface EnterpriseHumanReviewArchiveAttestationSnapshot {
  readonly schemaVersion: typeof EAE_HUMAN_REVIEW_ARCHIVE_ATTESTATION_SCHEMA_VERSION;
  readonly attestationId: string;
  readonly tenant: TenantContext;
  readonly archiveId: string;
  readonly validationId: string;
  readonly attestorId: string;
  readonly statement: string;
  readonly disposition: HumanReviewArchiveAttestationDisposition;
  readonly evidenceRefs: readonly string[];
  readonly readOnly: true;
  readonly executable: false;
}

function tenantKey(t: TenantContext): string { return `${t.tenantId}:${t.environmentId}`; }
function canonical(v: unknown): string { if(Array.isArray(v)) return `[${v.map(canonical).join(',')}]`; if(v&&typeof v==='object') return `{${Object.entries(v as Record<string,unknown>).sort(([a],[b])=>a.localeCompare(b)).map(([k,x])=>`${JSON.stringify(k)}:${canonical(x)}`).join(',')}}`; const x=JSON.stringify(v); if(x===undefined) throw new Error('non_json_value_rejected'); return x; }
function hash(v: unknown): string { let h=2166136261; for(const c of canonical(v)){ h^=c.charCodeAt(0); h=Math.imul(h,16777619); } return (h>>>0).toString(16).padStart(8,'0'); }
function freeze<T>(v:T):T { if(!v||typeof v!=='object'||Object.isFrozen(v)) return v; Object.freeze(v); for(const x of Object.values(v as Record<string,unknown>)) freeze(x); return v; }

export function buildEnterpriseHumanReviewArchiveAttestation(request: EnterpriseHumanReviewArchiveAttestationRequest): EnterpriseHumanReviewArchiveAttestationSnapshot {
  if(!request.tenant.tenantId||!request.tenant.environmentId) throw new Error('tenant_required');
  if(tenantKey(request.integrity.tenant)!==tenantKey(request.tenant)) throw new Error('archive_integrity_tenant_boundary_violation');
  if(request.integrity.executable!==false||request.integrity.readOnly!==true) throw new Error('unsafe_archive_integrity_result_rejected');
  const attestorId=request.attestorId.trim();
  const statement=request.statement.trim();
  if(!attestorId) throw new Error('attestor_id_required');
  if(!statement) throw new Error('attestation_statement_required');
  if(attestorId.length>256||statement.length>2048) throw new Error('unbounded_archive_attestation_rejected');
  let disposition:HumanReviewArchiveAttestationDisposition='attested';
  if(request.integrity.disposition==='empty') disposition='empty';
  else if(!request.integrity.valid||request.integrity.disposition==='invalid') disposition='rejected';
  const base={schemaVersion:EAE_HUMAN_REVIEW_ARCHIVE_ATTESTATION_SCHEMA_VERSION,tenant:request.tenant,archiveId:request.integrity.archiveId,validationId:request.integrity.validationId,attestorId,statement,disposition,evidenceRefs:[...new Set([...request.integrity.evidenceRefs,...request.evidenceRefs])].sort(),readOnly:true as const,executable:false as const};
  return freeze({...base,attestationId:`eae_human_review_archive_attestation_${hash(base)}`});
}
