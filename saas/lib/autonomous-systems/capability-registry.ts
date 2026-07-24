import type { RiskLevel, TenantContext } from './types.ts';

export const EAE_CAPABILITY_SCHEMA_VERSION = '1.0.0' as const;
export type CapabilityStatus = 'available' | 'degraded' | 'disabled';
export type CapabilityKind = 'reasoning' | 'retrieval' | 'generation' | 'analysis' | 'workflow' | 'integration';
type Json = null | boolean | number | string | readonly Json[] | { readonly [key: string]: Json };

export interface EnterpriseCapability {
  readonly schemaVersion: typeof EAE_CAPABILITY_SCHEMA_VERSION;
  readonly capabilityId: string;
  readonly version: string;
  readonly tenant: TenantContext;
  readonly name: string;
  readonly kind: CapabilityKind;
  readonly status: CapabilityStatus;
  readonly supportedActions: readonly string[];
  readonly supportedRegions: readonly string[];
  readonly maxRiskLevel: RiskLevel;
  readonly requiresHumanApproval: boolean;
  readonly evidenceRefs: readonly string[];
  readonly metadata: Readonly<Record<string, Json>>;
}

export interface CapabilityQuery {
  readonly tenant: TenantContext;
  readonly action?: string;
  readonly region?: string;
  readonly riskLevel?: RiskLevel;
  readonly includeDegraded?: boolean;
  readonly maxResults: number;
}

export interface CapabilityRegistrySnapshot {
  readonly schemaVersion: typeof EAE_CAPABILITY_SCHEMA_VERSION;
  readonly snapshotId: string;
  readonly tenant: TenantContext;
  readonly capabilityIds: readonly string[];
  readonly capabilities: readonly EnterpriseCapability[];
  readonly truncated: boolean;
}

const riskOrder: Readonly<Record<RiskLevel, number>> = { low: 0, medium: 1, high: 2, critical: 3 };
const secret = /(secret|token|password|credential|authorization|private.?key|api.?key)/i;
function tenantKey(t: TenantContext): string { return `${t.tenantId}:${t.environmentId}`; }
function canonical(v: unknown): string { if(Array.isArray(v)) return `[${v.map(canonical).join(',')}]`; if(v&&typeof v==='object') return `{${Object.entries(v as Record<string,unknown>).sort(([a],[b])=>a.localeCompare(b)).map(([k,x])=>`${JSON.stringify(k)}:${canonical(x)}`).join(',')}}`; const x=JSON.stringify(v); if(x===undefined) throw new Error('non_json_value_rejected'); return x; }
function hash(v: unknown): string { let h=2166136261; for(const c of canonical(v)){ h^=c.charCodeAt(0); h=Math.imul(h,16777619); } return (h>>>0).toString(16).padStart(8,'0'); }
function freeze<T>(v:T):T { if(!v||typeof v!=='object'||Object.isFrozen(v)) return v; Object.freeze(v); for(const x of Object.values(v as Record<string,unknown>)) freeze(x); return v; }
function safe(v: unknown, p='value'): void { if(typeof v==='function'||typeof v==='symbol'||typeof v==='bigint') throw new Error(`${p}_executable_rejected`); if(typeof v==='number'&&!Number.isFinite(v)) throw new Error(`${p}_non_finite_number`); if(!v||typeof v!=='object') return; for(const [k,x] of Object.entries(v as Record<string,unknown>)){ if(secret.test(k)) throw new Error(`${p}_secret_rejected`); safe(x,`${p}.${k}`); } }
function validVersion(v:string):boolean { return /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(v); }

function validateCapability(c:EnterpriseCapability, tenant:TenantContext):void {
  if(c.schemaVersion!==EAE_CAPABILITY_SCHEMA_VERSION) throw new Error('unsupported_schema');
  if(tenantKey(c.tenant)!==tenantKey(tenant)) throw new Error('tenant_environment_boundary_violation');
  if(!c.capabilityId||!c.name||!validVersion(c.version)) throw new Error('invalid_capability');
  if(!c.supportedActions.length) throw new Error('supported_action_required');
  if(new Set(c.supportedActions).size!==c.supportedActions.length) throw new Error('duplicate_supported_action');
  if(new Set(c.supportedRegions).size!==c.supportedRegions.length) throw new Error('duplicate_supported_region');
  safe(c.metadata,'metadata');
}

export function buildCapabilityRegistrySnapshot(capabilities:readonly EnterpriseCapability[], query:CapabilityQuery):CapabilityRegistrySnapshot {
  if(!query.tenant.tenantId||!query.tenant.environmentId) throw new Error('tenant_required');
  if(!Number.isInteger(query.maxResults)||query.maxResults<1||query.maxResults>256) throw new Error('unbounded_capability_query_rejected');
  const keys=new Set<string>();
  capabilities.forEach(c=>{ validateCapability(c,query.tenant); const key=`${c.capabilityId}@${c.version}`; if(keys.has(key)) throw new Error('duplicate_capability_version'); keys.add(key); });
  const matches=capabilities.filter(c=>c.status!=='disabled'&&(query.includeDegraded||c.status==='available')&&(!query.action||c.supportedActions.includes(query.action))&&(!query.region||c.supportedRegions.length===0||c.supportedRegions.includes(query.region))&&(!query.riskLevel||riskOrder[query.riskLevel]<=riskOrder[c.maxRiskLevel])).sort((a,b)=>a.capabilityId.localeCompare(b.capabilityId)||b.version.localeCompare(a.version));
  const selected=matches.slice(0,query.maxResults).map(c=>freeze({...c,supportedActions:[...c.supportedActions].sort(),supportedRegions:[...c.supportedRegions].sort(),evidenceRefs:[...new Set(c.evidenceRefs)].sort(),metadata:{...c.metadata}}));
  const base={schemaVersion:EAE_CAPABILITY_SCHEMA_VERSION,tenant:query.tenant,capabilityIds:selected.map(c=>`${c.capabilityId}@${c.version}`),capabilities:selected,truncated:matches.length>query.maxResults};
  return freeze({...base,snapshotId:`eae_capability_${hash(base)}`});
}
