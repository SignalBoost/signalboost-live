import type { TenantContext } from './types.ts';
import type { EnterpriseHumanReviewArchiveSnapshot } from './human-review-archive-builder.ts';

export const EAE_HUMAN_REVIEW_ARCHIVE_INTEGRITY_SCHEMA_VERSION = '1.0.0' as const;
export type HumanReviewArchiveIntegrityDisposition = 'valid' | 'invalid' | 'empty';

export interface EnterpriseHumanReviewArchiveIntegrityRequest {
  readonly tenant: TenantContext;
  readonly archive: EnterpriseHumanReviewArchiveSnapshot;
  readonly maxEntries: number;
}

export interface EnterpriseHumanReviewArchiveIntegrityResult {
  readonly schemaVersion: typeof EAE_HUMAN_REVIEW_ARCHIVE_INTEGRITY_SCHEMA_VERSION;
  readonly validationId: string;
  readonly tenant: TenantContext;
  readonly archiveId: string;
  readonly disposition: HumanReviewArchiveIntegrityDisposition;
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly validatedArchiveEntryIds: readonly string[];
  readonly evidenceRefs: readonly string[];
  readonly truncated: boolean;
  readonly readOnly: true;
  readonly executable: false;
}

function tenantKey(t: TenantContext): string { return `${t.tenantId}:${t.environmentId}`; }
function canonical(v: unknown): string { if(Array.isArray(v)) return `[${v.map(canonical).join(',')}]`; if(v&&typeof v==='object') return `{${Object.entries(v as Record<string,unknown>).sort(([a],[b])=>a.localeCompare(b)).map(([k,x])=>`${JSON.stringify(k)}:${canonical(x)}`).join(',')}}`; const x=JSON.stringify(v); if(x===undefined) throw new Error('non_json_value_rejected'); return x; }
function hash(v: unknown): string { let h=2166136261; for(const c of canonical(v)){ h^=c.charCodeAt(0); h=Math.imul(h,16777619); } return (h>>>0).toString(16).padStart(8,'0'); }
function freeze<T>(v:T):T { if(!v||typeof v!=='object'||Object.isFrozen(v)) return v; Object.freeze(v); for(const x of Object.values(v as Record<string,unknown>)) freeze(x); return v; }

export function validateEnterpriseHumanReviewArchiveIntegrity(request: EnterpriseHumanReviewArchiveIntegrityRequest): EnterpriseHumanReviewArchiveIntegrityResult {
  if(!request.tenant.tenantId||!request.tenant.environmentId) throw new Error('tenant_required');
  if(!Number.isInteger(request.maxEntries)||request.maxEntries<1||request.maxEntries>512) throw new Error('unbounded_archive_integrity_validation_rejected');
  if(tenantKey(request.archive.tenant)!==tenantKey(request.tenant)) throw new Error('review_archive_tenant_boundary_violation');
  if(request.archive.executable!==false||request.archive.readOnly!==true) throw new Error('unsafe_review_archive_rejected');
  const errors:string[]=[];
  const entries=request.archive.entries.slice(0,request.maxEntries);
  const ids=new Set<string>();
  for(const entry of entries){
    if(ids.has(entry.archiveEntryId)) errors.push('duplicate_archive_entry_id'); else ids.add(entry.archiveEntryId);
    if(entry.executable!==false||entry.readOnly!==true) errors.push('unsafe_archive_entry');
    if(!entry.archiveEntryId||!entry.closureId||!entry.outcomeId||!entry.acknowledgmentRegistryId) errors.push('archive_entry_identity_required');
    const overlap=entry.closedProposalIds.filter(id=>entry.pendingProposalIds.includes(id));
    if(overlap.length>0) errors.push('proposal_classification_conflict');
  }
  if(request.archive.disposition==='empty'&&request.archive.entries.length>0) errors.push('empty_archive_contains_entries');
  if(request.archive.disposition!=='empty'&&request.archive.entries.length===0&&request.archive.priorArchiveEntryIds.length===0) errors.push('nonempty_archive_missing_entries');
  const uniqueErrors=[...new Set(errors)].sort();
  const disposition:HumanReviewArchiveIntegrityDisposition=request.archive.entries.length===0&&uniqueErrors.length===0?'empty':uniqueErrors.length===0?'valid':'invalid';
  const base={schemaVersion:EAE_HUMAN_REVIEW_ARCHIVE_INTEGRITY_SCHEMA_VERSION,tenant:request.tenant,archiveId:request.archive.archiveId,disposition,valid:uniqueErrors.length===0,errors:uniqueErrors,validatedArchiveEntryIds:entries.map(entry=>entry.archiveEntryId).sort(),evidenceRefs:[...new Set([...request.archive.evidenceRefs,...entries.flatMap(entry=>entry.evidenceRefs)])].sort(),truncated:request.archive.entries.length>request.maxEntries,readOnly:true as const,executable:false as const};
  return freeze({...base,validationId:`eae_human_review_archive_integrity_${hash(base)}`});
}
