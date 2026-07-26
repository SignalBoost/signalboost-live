// saas/lib/autonomous-systems/risk-engine.ts
import { createHash } from 'node:crypto';
import type { RiskLevel, TenantContext } from './types.ts';

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
  /**
   * Subjects of the selected signals, index-aligned with signalIds. Present because the
   * assessment identity is a hash of this snapshot: anything the identity must distinguish
   * has to be visible here, or the id stops being verifiable from the snapshot alone.
   */
  readonly subjects: readonly string[];
  readonly evidenceRefs: readonly string[];
  readonly truncated: boolean;
  readonly readOnly: true;
  readonly executable: false;
}

const riskScore: Readonly<Record<RiskLevel, number>> = { low: 1, medium: 2, high: 3, critical: 4 };

function sameTenant(left: TenantContext, right: TenantContext): boolean {
  return left.tenantId === right.tenantId && left.environmentId === right.environmentId;
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`;
  const encoded = JSON.stringify(value);
  if (encoded === undefined) throw new Error('non_json_value_rejected');
  return encoded;
}

function hash(value: unknown): string {
  return createHash('sha256').update(canonical(value), 'utf8').digest('hex');
}

function freeze<T>(value: T): T {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const item of Object.values(value as Record<string, unknown>)) freeze(item);
  return value;
}

export function assessEnterpriseRisk(request: RiskAssessmentRequest): EnterpriseRiskAssessmentSnapshot {
  if (!request.tenant.tenantId || !request.tenant.environmentId) throw new Error('tenant_required');
  if (!Number.isInteger(request.maxSignals) || request.maxSignals < 1 || request.maxSignals > 256) throw new Error('unbounded_risk_assessment_rejected');
  if (request.signals.length > 1024) throw new Error('unbounded_risk_signals_rejected');

  const seen = new Set<string>();
  for (const signal of request.signals) {
    if (!sameTenant(signal.tenant, request.tenant)) throw new Error('tenant_environment_boundary_violation');
    if (!signal.signalId.trim() || !signal.subject.trim() || !Number.isFinite(signal.weight) || signal.weight < 0 || signal.weight > 100) throw new Error('invalid_risk_signal');
    if (seen.has(signal.signalId)) throw new Error('duplicate_risk_signal_id');
    if (signal.evidenceRefs.length > 256) throw new Error('unbounded_risk_evidence_rejected');
    seen.add(signal.signalId);
  }

  const ordered = [...request.signals].sort((left, right) => riskScore[right.riskLevel] - riskScore[left.riskLevel] || right.weight - left.weight || left.signalId.localeCompare(right.signalId));
  const selected = ordered.slice(0, request.maxSignals);
  const score = selected.reduce((total, signal) => total + riskScore[signal.riskLevel] * signal.weight, 0);
  const riskLevel: RiskLevel = selected.some((signal) => signal.riskLevel === 'critical') ? 'critical' : selected.some((signal) => signal.riskLevel === 'high') ? 'high' : selected.some((signal) => signal.riskLevel === 'medium') ? 'medium' : 'low';
  const base = {
    schemaVersion: EAE_RISK_ENGINE_SCHEMA_VERSION,
    tenant: request.tenant,
    riskLevel,
    score,
    signalIds: selected.map((signal) => signal.signalId),
    // Subject is material to what was assessed, so it must be inside the hashed base. It was
    // omitted, which meant two assessments of DIFFERENT subjects that happened to share a
    // signalId produced a byte-identical assessmentId — a silent collision in an identifier
    // the engine treats as unique evidence. Index-aligned with signalIds above.
    subjects: selected.map((signal) => signal.subject),
    evidenceRefs: [...new Set(selected.flatMap((signal) => signal.evidenceRefs))].sort(),
    truncated: ordered.length > request.maxSignals,
    readOnly: true as const,
    executable: false as const,
  };
  return freeze({ ...base, assessmentId: `eae_risk_${hash(base)}` });
}

export const buildEnterpriseRiskAssessment = assessEnterpriseRisk;
