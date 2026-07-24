import type { RiskLevel, TenantContext } from './types.ts';

export const EAE_POLICY_SCHEMA_VERSION = '1.0.0' as const;
export type PolicyEffect = 'allow' | 'deny' | 'require_review' | 'escalate';
export type PolicyScope = 'global' | 'region' | 'business_unit' | 'team' | 'workflow';
type Json = null | boolean | number | string | readonly Json[] | { readonly [key: string]: Json };

export interface GovernancePolicy {
  readonly schemaVersion: typeof EAE_POLICY_SCHEMA_VERSION;
  readonly policyId: string;
  readonly tenant: TenantContext;
  readonly name: string;
  readonly scope: PolicyScope;
  readonly scopeId?: string;
  readonly actionCategory?: string;
  readonly riskLevel?: RiskLevel;
  readonly effect: PolicyEffect;
  readonly precedence: number;
  readonly enabled: boolean;
  readonly validFrom?: string;
  readonly validUntil?: string;
  readonly overrides?: readonly string[];
  readonly evidenceRefs: readonly string[];
  readonly metadata: Readonly<Record<string, Json>>;
}

export interface GovernanceRequest {
  readonly tenant: TenantContext;
  readonly actionCategory: string;
  readonly riskLevel: RiskLevel;
  readonly region?: string;
  readonly businessUnitId?: string;
  readonly teamId?: string;
  readonly workflowId?: string;
  readonly evaluatedAt: string;
  readonly maxPolicies: number;
}

export interface PolicyConflict { readonly policyIds: readonly string[]; readonly reason: 'equal_precedence_contradiction' | 'circular_override'; }
export interface GovernanceDecision {
  readonly schemaVersion: typeof EAE_POLICY_SCHEMA_VERSION;
  readonly decisionId: string;
  readonly tenant: TenantContext;
  readonly effect: PolicyEffect;
  readonly matchedPolicyIds: readonly string[];
  readonly decisivePolicyIds: readonly string[];
  readonly conflicts: readonly PolicyConflict[];
  readonly evidenceRefs: readonly string[];
  readonly explanations: readonly string[];
  readonly blocked: boolean;
  readonly truncated: boolean;
  readonly evaluatedAt: string;
}

const secret = /(secret|token|password|credential|authorization|private.?key|api.?key)/i;
function tenantKey(t: TenantContext): string { return `${t.tenantId}:${t.environmentId}`; }
function canonical(v: unknown): string { if(Array.isArray(v)) return `[${v.map(canonical).join(',')}]`; if(v&&typeof v==='object') return `{${Object.entries(v as Record<string,unknown>).sort(([a],[b])=>a.localeCompare(b)).map(([k,x])=>`${JSON.stringify(k)}:${canonical(x)}`).join(',')}}`; const x=JSON.stringify(v); if(x===undefined) throw new Error('non_json_value_rejected'); return x; }
function hash(v: unknown): string { let h=2166136261; for(const c of canonical(v)){ h^=c.charCodeAt(0); h=Math.imul(h,16777619); } return (h>>>0).toString(16).padStart(8,'0'); }
function freeze<T>(v:T):T { if(!v||typeof v!=='object'||Object.isFrozen(v)) return v; Object.freeze(v); for(const x of Object.values(v as Record<string,unknown>)) freeze(x); return v; }
function safe(v: unknown, p='value'): void { if(typeof v==='function'||typeof v==='symbol'||typeof v==='bigint') throw new Error(`${p}_executable_rejected`); if(typeof v==='number'&&!Number.isFinite(v)) throw new Error(`${p}_non_finite_number`); if(!v||typeof v!=='object') return; for(const [k,x] of Object.entries(v as Record<string,unknown>)){ if(secret.test(k)) throw new Error(`${p}_secret_rejected`); safe(x,`${p}.${k}`); } }
function appliesScope(p:GovernancePolicy,r:GovernanceRequest):boolean { if(p.scope==='global') return true; if(p.scope==='region') return p.scopeId===r.region; if(p.scope==='business_unit') return p.scopeId===r.businessUnitId; if(p.scope==='team') return p.scopeId===r.teamId; return p.scopeId===r.workflowId; }
function validatePolicy(p:GovernancePolicy,r:GovernanceRequest):void { if(p.schemaVersion!==EAE_POLICY_SCHEMA_VERSION) throw new Error('unsupported_schema'); if(!p.policyId||!p.name) throw new Error('invalid_policy'); if(tenantKey(p.tenant)!==tenantKey(r.tenant)) throw new Error('tenant_environment_boundary_violation'); if(!Number.isInteger(p.precedence)||p.precedence<0||p.precedence>10000) throw new Error('invalid_precedence'); for(const t of [p.validFrom,p.validUntil].filter(Boolean) as string[]) if(!Number.isFinite(Date.parse(t))) throw new Error('invalid_timestamp'); safe(p.metadata,'metadata'); }
function circularOverrides(policies:readonly GovernancePolicy[]):PolicyConflict[] { const byId=new Map(policies.map(p=>[p.policyId,p])); const out:PolicyConflict[]=[]; for(const start of policies){ const seen:string[]=[]; let cur:GovernancePolicy|undefined=start; while(cur?.overrides?.length){ const next=cur.overrides[0]; if(next===start.policyId){ out.push({policyIds:[...seen,start.policyId].sort(),reason:'circular_override'}); break; } if(seen.includes(next)) break; seen.push(cur.policyId); cur=byId.get(next); } } const uniq=new Map(out.map(x=>[x.policyIds.join(','),x])); return [...uniq.values()].sort((a,b)=>a.policyIds.join(',').localeCompare(b.policyIds.join(','))); }

export function evaluateGovernancePolicies(policies:readonly GovernancePolicy[], request:GovernanceRequest):GovernanceDecision {
  if(!request.tenant.tenantId||!request.tenant.environmentId) throw new Error('tenant_required');
  if(!Number.isFinite(Date.parse(request.evaluatedAt))) throw new Error('invalid_evaluated_at');
  if(!Number.isInteger(request.maxPolicies)||request.maxPolicies<1||request.maxPolicies>256) throw new Error('unbounded_policy_request_rejected');
  const ids=new Set<string>(); policies.forEach(p=>{validatePolicy(p,request); if(ids.has(p.policyId)) throw new Error('duplicate_policy_id'); ids.add(p.policyId);});
  const at=Date.parse(request.evaluatedAt);
  const matching=policies.filter(p=>p.enabled&&(!p.actionCategory||p.actionCategory===request.actionCategory)&&(!p.riskLevel||p.riskLevel===request.riskLevel)&&appliesScope(p,request)&&(!p.validFrom||Date.parse(p.validFrom)<=at)&&(!p.validUntil||Date.parse(p.validUntil)>=at)).sort((a,b)=>b.precedence-a.precedence||a.policyId.localeCompare(b.policyId));
  const selected=matching.slice(0,request.maxPolicies); const top=selected[0]?.precedence; const decisive=selected.filter(p=>p.precedence===top); const conflictPolicies=decisive.length>1&&new Set(decisive.map(p=>p.effect)).size>1?decisive.map(p=>p.policyId).sort():[];
  const conflicts:PolicyConflict[]=[...(conflictPolicies.length?[{policyIds:conflictPolicies,reason:'equal_precedence_contradiction' as const}]:[]),...circularOverrides(selected)];
  const effect:PolicyEffect=conflicts.length?'escalate':decisive[0]?.effect??'require_review';
  const base={schemaVersion:EAE_POLICY_SCHEMA_VERSION,tenant:request.tenant,effect,matchedPolicyIds:selected.map(p=>p.policyId),decisivePolicyIds:decisive.map(p=>p.policyId),conflicts,evidenceRefs:[...new Set(selected.flatMap(p=>p.evidenceRefs))].sort(),explanations:conflicts.length?conflicts.map(c=>`${c.reason}:${c.policyIds.join(',')}`):decisive.length?[`highest_precedence:${decisive[0].precedence}`,`effect:${effect}`]:['no_matching_policy','default:require_review'],blocked:effect==='deny'||effect==='escalate',truncated:matching.length>request.maxPolicies,evaluatedAt:request.evaluatedAt};
  return freeze({...base,decisionId:`eae_policy_${hash(base)}`});
}
