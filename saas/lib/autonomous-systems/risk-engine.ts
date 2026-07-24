import type { ContextGap, ContextSnapshot, DigitalTwinEntity } from './enterprise-context.ts';
import { EAE_ENTERPRISE_CONTEXT_SCHEMA_VERSION } from './enterprise-context.ts';
import type { ObjectiveEvaluation } from './objective-engine.ts';
import { EAE_OBJECTIVE_SCHEMA_VERSION } from './objective-engine.ts';
import type { RiskLevel, TenantContext } from './types.ts';

export const EAE_RISK_SCHEMA_VERSION = '1.0.0' as const;

type Json = null | boolean | number | string | readonly Json[] | { readonly [key: string]: Json };
type RiskFindingSource = 'context_risk' | 'context_gap' | 'objective_evaluation';

export interface EnterpriseRiskFinding {
  readonly findingId: string;
  readonly source: RiskFindingSource;
  readonly severity: RiskLevel;
  readonly likelihood: number;
  readonly impact: number;
  readonly score: number;
  readonly entityIds: readonly string[];
  readonly objectiveIds: readonly string[];
  readonly evidenceRefs: readonly string[];
  readonly reasons: readonly string[];
}

export interface EnterpriseRiskAssessmentRequest {
  readonly tenant: TenantContext;
  readonly snapshot: ContextSnapshot;
  readonly objectiveEvaluation?: ObjectiveEvaluation;
  readonly assessedAt: string;
  readonly maxFindings: number;
}

export interface EnterpriseRiskAssessment {
  readonly schemaVersion: typeof EAE_RISK_SCHEMA_VERSION;
  readonly assessmentId: string;
  readonly tenant: TenantContext;
  readonly assessedAt: string;
  readonly sourceSnapshotId: string;
  readonly sourceObjectiveEvaluationId?: string;
  readonly findings: readonly EnterpriseRiskFinding[];
  readonly overallRisk: RiskLevel;
  readonly truncated: boolean;
  readonly boundary: 'pre_cos_reasoning_only';
}

const secret = /(secret|token|password|credential|authorization|private.?key|api.?key)/i;
const riskOrder: Readonly<Record<RiskLevel, number>> = { low: 0, medium: 1, high: 2, critical: 3 };
const riskScore: Readonly<Record<RiskLevel, number>> = { low: 0.25, medium: 0.5, high: 0.75, critical: 1 };

function tenantKey(tenant: TenantContext): string { return `${tenant.tenantId}:${tenant.environmentId}`; }
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`).join(',')}}`;
  const encoded = JSON.stringify(value);
  if (encoded === undefined) throw new Error('non_json_value_rejected');
  return encoded;
}
function hash(value: unknown): string { let result = 2166136261; for (const character of canonical(value)) { result ^= character.charCodeAt(0); result = Math.imul(result, 16777619); } return (result >>> 0).toString(16).padStart(8, '0'); }
function freeze<T>(value: T): T { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.freeze(value); for (const child of Object.values(value as Record<string, unknown>)) freeze(child); return value; }
function assertSafe(value: unknown, path = 'value'): asserts value is Json { if (typeof value === 'function' || typeof value === 'symbol' || typeof value === 'bigint') throw new Error(`${path}_executable_rejected`); if (typeof value === 'number' && !Number.isFinite(value)) throw new Error(`${path}_non_finite_number`); if (!value || typeof value !== 'object') return; for (const [key, child] of Object.entries(value as Record<string, unknown>)) { if (secret.test(key)) throw new Error(`${path}_secret_rejected`); assertSafe(child, `${path}.${key}`); } }
function severity(value: unknown, fallback: RiskLevel): RiskLevel { if (value === undefined) return fallback; if (typeof value !== 'string' || !(value in riskOrder)) throw new Error('invalid_risk_level'); return value as RiskLevel; }
function stable(values: readonly string[]): readonly string[] { return [...new Set(values)].sort(); }

function validateSnapshot(snapshot: ContextSnapshot, tenant: TenantContext): void {
  if (snapshot.schemaVersion !== EAE_ENTERPRISE_CONTEXT_SCHEMA_VERSION) throw new Error('unsupported_context_schema');
  if (tenantKey(snapshot.tenant) !== tenantKey(tenant)) throw new Error('tenant_environment_boundary_violation');
  if (!snapshot.snapshotId || !Number.isFinite(Date.parse(snapshot.snapshotAt))) throw new Error('invalid_context_snapshot');
  if (snapshot.entities.length > 256 || snapshot.relationships.length > 1024 || snapshot.gaps.length > 256) throw new Error('unbounded_context_snapshot_rejected');
  assertSafe(snapshot, 'context_snapshot');
  if (snapshot.gaps.some((gap) => gap.code === 'policy_conflict' || gap.code === 'conflicting_entity_status')) throw new Error('contradictory_context_rejected');
  const ids = new Set<string>();
  for (const entity of snapshot.entities) {
    if (!entity.entityId || ids.has(entity.entityId) || tenantKey(entity.tenant) !== tenantKey(tenant)) throw new Error('invalid_context_entity');
    ids.add(entity.entityId);
  }
}

function validateObjectiveEvaluation(evaluation: ObjectiveEvaluation, tenant: TenantContext): void {
  if (evaluation.schemaVersion !== EAE_OBJECTIVE_SCHEMA_VERSION) throw new Error('unsupported_objective_schema');
  if (tenantKey(evaluation.tenant) !== tenantKey(tenant) || !Number.isFinite(Date.parse(evaluation.evaluatedAt))) throw new Error('tenant_environment_boundary_violation');
  assertSafe(evaluation, 'objective_evaluation');
  if (evaluation.conflicts.some((conflict) => conflict.type === 'metric_tension' || conflict.type === 'dependency_cycle')) throw new Error('contradictory_objective_evaluation_rejected');
}

function riskEntityFinding(entity: DigitalTwinEntity): EnterpriseRiskFinding {
  const level = severity(entity.metadata.riskLevel, entity.critical ? 'high' : 'medium');
  const base = { source: 'context_risk' as const, severity: level, likelihood: riskScore[level], impact: entity.critical ? 1 : riskScore[level], entityIds: [entity.entityId], objectiveIds: [], evidenceRefs: stable(entity.provenance.evidenceRefs), reasons: stable(['modeled_enterprise_risk', `status:${entity.status}`]) };
  return { ...base, score: Number((base.likelihood * base.impact).toFixed(2)), findingId: `eae_risk_${hash(base)}` };
}

function gapFinding(gap: ContextGap): EnterpriseRiskFinding {
  const level: RiskLevel = gap.severity === 'critical' ? 'critical' : 'medium';
  const base = { source: 'context_gap' as const, severity: level, likelihood: riskScore[level], impact: riskScore[level], entityIds: gap.entityId ? [gap.entityId] : [], objectiveIds: [], evidenceRefs: [], reasons: stable([`context_gap:${gap.code}`, gap.detail]) };
  return { ...base, score: Number((base.likelihood * base.impact).toFixed(2)), findingId: `eae_risk_${hash(base)}` };
}

function objectiveFinding(objectiveId: string): EnterpriseRiskFinding {
  const base = { source: 'objective_evaluation' as const, severity: 'high' as const, likelihood: 0.75, impact: 0.75, entityIds: [], objectiveIds: [objectiveId], evidenceRefs: [], reasons: ['objective_blocked'] };
  return { ...base, score: Number((base.likelihood * base.impact).toFixed(2)), findingId: `eae_risk_${hash(base)}` };
}

export function assessEnterpriseRisks(request: EnterpriseRiskAssessmentRequest): EnterpriseRiskAssessment {
  if (!request.tenant.tenantId || !request.tenant.environmentId) throw new Error('tenant_required');
  if (!Number.isFinite(Date.parse(request.assessedAt))) throw new Error('invalid_assessed_at');
  if (!Number.isInteger(request.maxFindings) || request.maxFindings < 1 || request.maxFindings > 256) throw new Error('unbounded_risk_request_rejected');
  validateSnapshot(request.snapshot, request.tenant);
  if (request.objectiveEvaluation) validateObjectiveEvaluation(request.objectiveEvaluation, request.tenant);

  const findings = [
    ...request.snapshot.risks.map(riskEntityFinding),
    ...request.snapshot.gaps.map(gapFinding),
    ...(request.objectiveEvaluation?.blockedObjectiveIds.map(objectiveFinding) ?? []),
  ].sort((left, right) => riskOrder[right.severity] - riskOrder[left.severity] || right.score - left.score || left.findingId.localeCompare(right.findingId));
  const selected = findings.slice(0, request.maxFindings);
  const base = { schemaVersion: EAE_RISK_SCHEMA_VERSION, tenant: request.tenant, assessedAt: request.assessedAt, sourceSnapshotId: request.snapshot.snapshotId, ...(request.objectiveEvaluation ? { sourceObjectiveEvaluationId: request.objectiveEvaluation.evaluationId } : {}), findings: selected, overallRisk: selected.reduce<RiskLevel>((current, finding) => riskOrder[finding.severity] > riskOrder[current] ? finding.severity : current, 'low'), truncated: findings.length > request.maxFindings, boundary: 'pre_cos_reasoning_only' as const };
  return freeze({ ...base, assessmentId: `eae_risk_assessment_${hash(base)}` });
}
