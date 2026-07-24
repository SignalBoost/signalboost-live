// saas/lib/autonomous-systems/risk-engine.ts
import type { RiskLevel, TenantContext } from './types.ts';

/** Versioned, deterministic contract for enterprise risk assessments. */
export const EAE_RISK_ENGINE_SCHEMA_VERSION = '1.0.0' as const;

export interface RiskSignal {
  readonly signalId: string;
  readonly tenant: TenantContext;
  readonly subject: string;
  readonly riskLevel: RiskLevel;
  readonly weight: number;
  readonly evidenceRefs: readonly string[];
}

export interface RiskAssessmentRequest {
  readonly tenant: TenantContext;
  readonly signals: readonly RiskSignal[];
  readonly maxSignals: number;
}

export interface EnterpriseRiskAssessmentSnapshot {
  readonly schemaVersion: typeof EAE_RISK_ENGINE_SCHEMA_VERSION;
  readonly assessmentId: string;
  readonly tenant: TenantContext;
  readonly riskLevel: RiskLevel;
  readonly score: number;
  readonly signalIds: readonly string[];
  readonly evidenceRefs: readonly string[];
  readonly truncated: boolean;
}

const riskScore: Readonly<Record<RiskLevel, number>> = { low: 1, medium: 2, high: 3, critical: 4 };

function tenantKey(tenant: TenantContext): string { return `${tenant.tenantId}:${tenant.environmentId}`; }
function canonical(value: unknown): string { if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`; if (value && typeof value === 'object') return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`; const encoded = JSON.stringify(value); if (encoded === undefined) throw new Error('non_json_value_rejected'); return encoded; }
function hash(value: unknown): string { let result = 2166136261; for (const character of canonical(value)) { result ^= character.charCodeAt(0); result = Math.imul(result, 16777619); } return (result >>> 0).toString(16).padStart(8, '0'); }
function freeze<T>(value: T): T { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.freeze(value); for (const item of Object.values(value as Record<string, unknown>)) freeze(item); return value; }

/**
 * Produces an immutable, tenant-scoped assessment only. It never authorizes or
 * executes an action; callers must retain their existing policy/approval gates.
 */
export function assessEnterpriseRisk(request: RiskAssessmentRequest): EnterpriseRiskAssessmentSnapshot {
  if (!request.tenant.tenantId || !request.tenant.environmentId) throw new Error('tenant_required');
  if (!Number.isInteger(request.maxSignals) || request.maxSignals < 1 || request.maxSignals > 256) throw new Error('unbounded_risk_assessment_rejected');
  const seen = new Set<string>();
  for (const signal of request.signals) {
    if (tenantKey(signal.tenant) !== tenantKey(request.tenant)) throw new Error('tenant_environment_boundary_violation');
    if (!signal.signalId || !signal.subject || !Number.isFinite(signal.weight) || signal.weight < 0 || signal.weight > 100) throw new Error('invalid_risk_signal');
    if (seen.has(signal.signalId)) throw new Error('duplicate_risk_signal_id');
    seen.add(signal.signalId);
  }
  const ordered = [...request.signals].sort((left, right) => riskScore[right.riskLevel] - riskScore[left.riskLevel] || right.weight - left.weight || left.signalId.localeCompare(right.signalId));
  const selected = ordered.slice(0, request.maxSignals);
  const score = selected.reduce((total, signal) => total + riskScore[signal.riskLevel] * signal.weight, 0);
  const riskLevel: RiskLevel = selected.some(signal => signal.riskLevel === 'critical') ? 'critical' : selected.some(signal => signal.riskLevel === 'high') ? 'high' : selected.some(signal => signal.riskLevel === 'medium') ? 'medium' : 'low';
  const base = { schemaVersion: EAE_RISK_ENGINE_SCHEMA_VERSION, tenant: request.tenant, riskLevel, score, signalIds: selected.map(signal => signal.signalId), evidenceRefs: [...new Set(selected.flatMap(signal => signal.evidenceRefs))].sort(), truncated: ordered.length > request.maxSignals };
  return freeze({ ...base, assessmentId: `eae_risk_${hash(base)}` });
}

export const buildEnterpriseRiskAssessment = assessEnterpriseRisk;
