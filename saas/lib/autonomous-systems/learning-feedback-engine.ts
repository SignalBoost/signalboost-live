import type { TenantContext } from './types.ts';
import type { EnterpriseOutcomeEvaluationSnapshot } from './outcome-evaluator.ts';

export const EAE_LEARNING_FEEDBACK_SCHEMA_VERSION = '1.0.0' as const;
export type LearningSignalKind = 'reinforce' | 'adjust' | 'investigate' | 'hold';
export type LearningDisposition = 'eligible_for_review' | 'needs_evidence' | 'blocked';

export interface EnterpriseLearningFeedbackRequest {
  readonly tenant: TenantContext;
  readonly evaluation: EnterpriseOutcomeEvaluationSnapshot;
  readonly priorSignalIds: readonly string[];
  readonly maxSignals: number;
}

export interface EnterpriseLearningSignal {
  readonly signalId: string;
  readonly kind: LearningSignalKind;
  readonly subjectId: string;
  readonly reason: string;
  readonly confidence: number;
  readonly evidenceRefs: readonly string[];
}

export interface EnterpriseLearningFeedbackSnapshot {
  readonly schemaVersion: typeof EAE_LEARNING_FEEDBACK_SCHEMA_VERSION;
  readonly feedbackId: string;
  readonly tenant: TenantContext;
  readonly evaluationId: string;
  readonly simulationId: string;
  readonly disposition: LearningDisposition;
  readonly readOnly: true;
  readonly executable: false;
  readonly signals: readonly EnterpriseLearningSignal[];
  readonly suppressedSignalIds: readonly string[];
  readonly evidenceRefs: readonly string[];
  readonly truncated: boolean;
}

function tenantKey(t: TenantContext): string { return `${t.tenantId}:${t.environmentId}`; }
function canonical(v: unknown): string { if(Array.isArray(v)) return `[${v.map(canonical).join(',')}]`; if(v&&typeof v==='object') return `{${Object.entries(v as Record<string,unknown>).sort(([a],[b])=>a.localeCompare(b)).map(([k,x])=>`${JSON.stringify(k)}:${canonical(x)}`).join(',')}}`; const x=JSON.stringify(v); if(x===undefined) throw new Error('non_json_value_rejected'); return x; }
function hash(v: unknown): string { let h=2166136261; for(const c of canonical(v)){ h^=c.charCodeAt(0); h=Math.imul(h,16777619); } return (h>>>0).toString(16).padStart(8,'0'); }
function freeze<T>(v:T):T { if(!v||typeof v!=='object'||Object.isFrozen(v)) return v; Object.freeze(v); for(const x of Object.values(v as Record<string,unknown>)) freeze(x); return v; }

export function deriveEnterpriseLearningFeedback(request: EnterpriseLearningFeedbackRequest): EnterpriseLearningFeedbackSnapshot {
  if(!request.tenant.tenantId||!request.tenant.environmentId) throw new Error('tenant_required');
  if(tenantKey(request.evaluation.tenant)!==tenantKey(request.tenant)) throw new Error('evaluation_tenant_boundary_violation');
  if(request.evaluation.executable!==false||request.evaluation.readOnly!==true) throw new Error('unsafe_evaluation_rejected');
  if(!Number.isInteger(request.maxSignals)||request.maxSignals<1||request.maxSignals>256) throw new Error('unbounded_learning_feedback_rejected');
  const prior=new Set(request.priorSignalIds);
  if(prior.size!==request.priorSignalIds.length) throw new Error('duplicate_prior_signal_id');
  const candidates:EnterpriseLearningSignal[]=[];
  for(const metric of request.evaluation.metrics){
    const kind:LearningSignalKind=metric.status==='met'?'reinforce':metric.status==='missed'?'adjust':'investigate';
    const reason=metric.status==='met'?'outcome_metric_met':metric.status==='missed'?'outcome_metric_missed':'outcome_metric_unavailable';
    const confidence=metric.status==='unavailable'?0:Number(Math.max(0,Math.min(1,metric.score)).toFixed(4));
    const base={kind,subjectId:metric.metricId,reason,confidence,evidenceRefs:[...new Set(metric.evidenceRefs)].sort()};
    candidates.push({...base,signalId:`eae_learning_signal_${hash(base)}`});
  }
  for(const recommendation of request.evaluation.recommendations){
    const base={kind:'hold' as const,subjectId:recommendation,reason:'evaluation_recommendation',confidence:1,evidenceRefs:[...request.evaluation.evidenceRefs].sort()};
    candidates.push({...base,signalId:`eae_learning_signal_${hash(base)}`});
  }
  const ordered=candidates.sort((a,b)=>a.signalId.localeCompare(b.signalId));
  const suppressed=ordered.filter(signal=>prior.has(signal.signalId)).map(signal=>signal.signalId);
  const signals=ordered.filter(signal=>!prior.has(signal.signalId)).slice(0,request.maxSignals);
  let disposition:LearningDisposition='eligible_for_review';
  if(request.evaluation.disposition==='blocked') disposition='blocked';
  else if(request.evaluation.disposition==='needs_review'||signals.some(signal=>signal.kind==='investigate')) disposition='needs_evidence';
  const base={schemaVersion:EAE_LEARNING_FEEDBACK_SCHEMA_VERSION,tenant:request.tenant,evaluationId:request.evaluation.evaluationId,simulationId:request.evaluation.simulationId,disposition,readOnly:true as const,executable:false as const,signals,suppressedSignalIds:[...new Set(suppressed)].sort(),evidenceRefs:[...new Set([...request.evaluation.evidenceRefs,...signals.flatMap(signal=>signal.evidenceRefs)])].sort(),truncated:ordered.filter(signal=>!prior.has(signal.signalId)).length>request.maxSignals};
  return freeze({...base,feedbackId:`eae_learning_feedback_${hash(base)}`});
}
