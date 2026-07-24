import type { TenantContext } from './types.ts';
import type { EnterpriseExecutionSimulationSnapshot } from './execution-orchestrator-simulation.ts';

export const EAE_OUTCOME_EVALUATION_SCHEMA_VERSION = '1.0.0' as const;
export type OutcomeMetricStatus = 'met' | 'missed' | 'unavailable';
export type OutcomeDisposition = 'validated' | 'needs_review' | 'blocked';

export interface OutcomeMetricTarget {
  readonly metricId: string;
  readonly target: number;
  readonly actual?: number;
  readonly weight: number;
  readonly evidenceRefs: readonly string[];
}

export interface EnterpriseOutcomeEvaluationRequest {
  readonly tenant: TenantContext;
  readonly simulation: EnterpriseExecutionSimulationSnapshot;
  readonly policyCompliant: boolean;
  readonly metrics: readonly OutcomeMetricTarget[];
  readonly maxMetrics: number;
}

export interface EvaluatedOutcomeMetric {
  readonly metricId: string;
  readonly target: number;
  readonly actual?: number;
  readonly weight: number;
  readonly status: OutcomeMetricStatus;
  readonly score: number;
  readonly evidenceRefs: readonly string[];
}

export interface EnterpriseOutcomeEvaluationSnapshot {
  readonly schemaVersion: typeof EAE_OUTCOME_EVALUATION_SCHEMA_VERSION;
  readonly evaluationId: string;
  readonly tenant: TenantContext;
  readonly simulationId: string;
  readonly planId: string;
  readonly disposition: OutcomeDisposition;
  readonly readOnly: true;
  readonly executable: false;
  readonly policyCompliant: boolean;
  readonly weightedScore: number;
  readonly metrics: readonly EvaluatedOutcomeMetric[];
  readonly recommendations: readonly string[];
  readonly evidenceRefs: readonly string[];
  readonly truncated: boolean;
}

function tenantKey(t: TenantContext): string { return `${t.tenantId}:${t.environmentId}`; }
function canonical(v: unknown): string { if(Array.isArray(v)) return `[${v.map(canonical).join(',')}]`; if(v&&typeof v==='object') return `{${Object.entries(v as Record<string,unknown>).sort(([a],[b])=>a.localeCompare(b)).map(([k,x])=>`${JSON.stringify(k)}:${canonical(x)}`).join(',')}}`; const x=JSON.stringify(v); if(x===undefined) throw new Error('non_json_value_rejected'); return x; }
function hash(v: unknown): string { let h=2166136261; for(const c of canonical(v)){ h^=c.charCodeAt(0); h=Math.imul(h,16777619); } return (h>>>0).toString(16).padStart(8,'0'); }
function freeze<T>(v:T):T { if(!v||typeof v!=='object'||Object.isFrozen(v)) return v; Object.freeze(v); for(const x of Object.values(v as Record<string,unknown>)) freeze(x); return v; }

export function evaluateEnterpriseOutcome(request: EnterpriseOutcomeEvaluationRequest): EnterpriseOutcomeEvaluationSnapshot {
  if(!request.tenant.tenantId||!request.tenant.environmentId) throw new Error('tenant_required');
  if(tenantKey(request.simulation.tenant)!==tenantKey(request.tenant)) throw new Error('simulation_tenant_boundary_violation');
  if(request.simulation.executable!==false) throw new Error('executable_simulation_rejected');
  if(!Number.isInteger(request.maxMetrics)||request.maxMetrics<1||request.maxMetrics>256) throw new Error('unbounded_outcome_evaluation_rejected');
  const ids=new Set<string>();
  for(const metric of request.metrics){
    if(!metric.metricId) throw new Error('metric_id_required');
    if(ids.has(metric.metricId)) throw new Error('duplicate_metric_id'); ids.add(metric.metricId);
    if(!Number.isFinite(metric.target)||!Number.isFinite(metric.weight)||metric.weight<=0) throw new Error('invalid_metric_definition');
    if(metric.actual!==undefined&&!Number.isFinite(metric.actual)) throw new Error('invalid_metric_actual');
  }
  const limited=[...request.metrics].sort((a,b)=>a.metricId.localeCompare(b.metricId)).slice(0,request.maxMetrics);
  const metrics=limited.map(metric=>{
    const status:OutcomeMetricStatus=metric.actual===undefined?'unavailable':metric.actual>=metric.target?'met':'missed';
    const score=status==='unavailable'?0:Math.max(0,Math.min(1,(metric.actual as number)/metric.target));
    return {metricId:metric.metricId,target:metric.target,actual:metric.actual,weight:metric.weight,status,score,evidenceRefs:[...new Set(metric.evidenceRefs)].sort()};
  });
  const totalWeight=metrics.reduce((sum,metric)=>sum+metric.weight,0);
  const weightedScore=totalWeight===0?0:Number((metrics.reduce((sum,metric)=>sum+(metric.score*metric.weight),0)/totalWeight).toFixed(4));
  const recommendations:string[]=[];
  if(!request.policyCompliant) recommendations.push('resolve_policy_noncompliance');
  if(request.simulation.status==='blocked') recommendations.push('review_blocked_simulation');
  if(request.simulation.status==='waiting_for_approval') recommendations.push('obtain_required_approvals');
  if(request.simulation.status==='simulated_with_rollback') recommendations.push('review_rollback_path');
  if(metrics.some(metric=>metric.status==='missed')) recommendations.push('review_missed_outcome_metrics');
  if(metrics.some(metric=>metric.status==='unavailable')) recommendations.push('collect_missing_metric_evidence');
  if(!recommendations.length) recommendations.push('retain_current_plan_for_human_review');
  let disposition:OutcomeDisposition='validated';
  if(!request.policyCompliant||request.simulation.status==='blocked') disposition='blocked';
  else if(request.simulation.status!=='simulated_complete'||weightedScore<1||metrics.some(metric=>metric.status==='unavailable')) disposition='needs_review';
  const base={schemaVersion:EAE_OUTCOME_EVALUATION_SCHEMA_VERSION,tenant:request.tenant,simulationId:request.simulation.simulationId,planId:request.simulation.planId,disposition,readOnly:true as const,executable:false as const,policyCompliant:request.policyCompliant,weightedScore,metrics,recommendations:[...new Set(recommendations)].sort(),evidenceRefs:[...new Set([...request.simulation.evidenceRefs,...metrics.flatMap(metric=>metric.evidenceRefs)])].sort(),truncated:request.metrics.length>request.maxMetrics};
  return freeze({...base,evaluationId:`eae_outcome_evaluation_${hash(base)}`});
}
