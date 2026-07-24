import type { TenantContext } from './types.ts';
import type { EnterpriseHumanReviewClosureSnapshot } from './human-review-closure-snapshot.ts';

export const EAE_HUMAN_REVIEW_ARCHIVE_SCHEMA_VERSION = '1.0.0' as const;
export type HumanReviewArchiveDisposition = 'complete' | 'partial' | 'blocked' | 'invalid' | 'empty';

export interface EnterpriseHumanReviewArchiveRequest {
  readonly tenant: TenantContext;
  readonly closures: readonly EnterpriseHumanReviewClosureSnapshot[];
  readonly priorArchiveEntryIds: readonly string[];
  readonly maxEntries: number;
}

export interface EnterpriseHumanReviewArchiveEntry {
  readonly archiveEntryId: string;
  readonly closureId: string;
  readonly outcomeId: string;
  readonly acknowledgmentRegistryId: string;
  readonly disposition: EnterpriseHumanReviewClosureSnapshot['disposition'];
  readonly closedProposalIds: readonly string[];
  readonly pendingProposalIds: readonly string[];
  readonly evidenceRefs: readonly string[];
  readonly readOnly: true;
  readonly executable: false;
}

export interface EnterpriseHumanReviewArchiveSnapshot {
  readonly schemaVersion: typeof EAE_HUMAN_REVIEW_ARCHIVE_SCHEMA_VERSION;
  readonly archiveId: string;
  readonly tenant: TenantContext;
  readonly disposition: HumanReviewArchiveDisposition;
  readonly entries: readonly EnterpriseHumanReviewArchiveEntry[];
  readonly priorArchiveEntryIds: readonly string[];
  readonly evidenceRefs: readonly string[];
  readonly truncated: boolean;
  readonly readOnly: true;
  readonly executable: false;
}

function tenantKey(t: TenantContext): string { return `${t.tenantId}:${t.environmentId}`; }
function canonical(v: unknown): string { if(Array.isArray(v)) return `[${v.map(canonical).join(',')}]`; if(v&&typeof v==='object') return `{${Object.entries(v as Record<string,unknown>).sort(([a],[b])=>a.localeCompare(b)).map(([k,x])=>`${JSON.stringify(k)}:${canonical(x)}`).join(',')}}`; const x=JSON.stringify(v); if(x===undefined) throw new Error('non_json_value_rejected'); return x; }
function hash(v: unknown): string { let h=2166136261; for(const c of canonical(v)){ h^=c.charCodeAt(0); h=Math.imul(h,16777619); } return (h>>>0).toString(16).padStart(8,'0'); }
function freeze<T>(v:T):T { if(!v||typeof v!=='object'||Object.isFrozen(v)) return v; Object.freeze(v); for(const x of Object.values(v as Record<string,unknown>)) freeze(x); return v; }

export function buildEnterpriseHumanReviewArchive(request: EnterpriseHumanReviewArchiveRequest): EnterpriseHumanReviewArchiveSnapshot {
  if(!request.tenant.tenantId||!request.tenant.environmentId) throw new Error('tenant_required');
  if(!Number.isInteger(request.maxEntries)||request.maxEntries<1||request.maxEntries>512) throw new Error('unbounded_review_archive_rejected');
  const prior=new Set(request.priorArchiveEntryIds);
  if(prior.size!==request.priorArchiveEntryIds.length) throw new Error('duplicate_prior_archive_entry_id');
  for(const closure of request.closures){
    if(tenantKey(closure.tenant)!==tenantKey(request.tenant)) throw new Error('review_closure_tenant_boundary_violation');
    if(closure.executable!==false||closure.readOnly!==true) throw new Error('unsafe_review_closure_rejected');
  }
  const candidates=request.closures.map(closure=>{
    const base={closureId:closure.closureId,outcomeId:closure.outcomeId,acknowledgmentRegistryId:closure.acknowledgmentRegistryId,disposition:closure.disposition,closedProposalIds:[...new Set(closure.closedProposalIds)].sort(),pendingProposalIds:[...new Set(closure.pendingProposalIds)].sort(),evidenceRefs:[...new Set(closure.evidenceRefs)].sort(),readOnly:true as const,executable:false as const};
    return {...base,archiveEntryId:`eae_human_review_archive_entry_${hash(base)}`};
  }).sort((a,b)=>a.archiveEntryId.localeCompare(b.archiveEntryId)).filter(entry=>!prior.has(entry.archiveEntryId));
  const entries=candidates.slice(0,request.maxEntries);
  let disposition:HumanReviewArchiveDisposition='complete';
  if(entries.some(entry=>entry.disposition==='blocked')) disposition='blocked';
  else if(entries.some(entry=>entry.disposition==='invalid')) disposition='invalid';
  else if(entries.length===0&&request.closures.length===0) disposition='empty';
  else if(entries.some(entry=>entry.disposition==='pending_acknowledgment')) disposition='partial';
  const base={schemaVersion:EAE_HUMAN_REVIEW_ARCHIVE_SCHEMA_VERSION,tenant:request.tenant,disposition,entries,priorArchiveEntryIds:[...prior].sort(),evidenceRefs:[...new Set(entries.flatMap(entry=>entry.evidenceRefs))].sort(),truncated:candidates.length>request.maxEntries,readOnly:true as const,executable:false as const};
  return freeze({...base,archiveId:`eae_human_review_archive_${hash(base)}`});
}
