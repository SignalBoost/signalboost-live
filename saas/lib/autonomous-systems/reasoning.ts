import type {
  CandidatePlan,
  RiskLevel,
  TenantContext,
  WorldStateSnapshot,
} from "./types.ts";

export const EAE_REASONING_SCHEMA_VERSION = "1.0.0" as const;

export type PerceptionKind =
  | "anomaly"
  | "opportunity"
  | "degradation"
  | "failure"
  | "security_event"
  | "compliance_event"
  | "performance_event"
  | "business_event";

export interface PerceptionSignal {
  readonly signalId: string;
  readonly subject: string;
  readonly kind: PerceptionKind;
  readonly confidence: number;
  readonly evidenceObservationIds: readonly string[];
  readonly reasons: readonly string[];
}

export interface Prediction {
  readonly predictionId: string;
  readonly subject: string;
  readonly probableOutcome: string;
  readonly confidence: number;
  readonly risk: RiskLevel;
  readonly expectedImpact: number;
  readonly urgency: number;
  readonly evidenceObservationIds: readonly string[];
}

export interface RankedPlan {
  readonly rank: number;
  readonly score: number;
  readonly plan: CandidatePlan;
}

export interface EnterprisePolicyProfile {
  readonly riskTolerance: "low" | "medium" | "high";
  readonly minimumConfidence: number;
  readonly valueWeight: number;
  readonly confidenceWeight: number;
  readonly riskWeight: number;
  readonly urgencyWeight: number;
}

export interface EnterpriseIntelligenceEnvelopeV1 {
  readonly schemaVersion: typeof EAE_REASONING_SCHEMA_VERSION;
  readonly envelopeId: string;
  readonly tenant: TenantContext;
  readonly emittedAt: string;
  readonly snapshotId: string;
  readonly situationSummary: readonly string[];
  readonly perceptions: readonly PerceptionSignal[];
  readonly predictions: readonly Prediction[];
  readonly rankedPlans: readonly RankedPlan[];
  readonly recommendedPlanId: string | null;
  readonly boundary: "pre_cos_reasoning_only";
}

const riskPenalty: Record<RiskLevel, number> = {
  low: 0,
  medium: 0.25,
  high: 0.6,
  critical: 1,
};

function clamp(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function fingerprint(value: unknown): string {
  const input = canonical(value);
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const entry of Object.values(value as Record<string, unknown>)) deepFreeze(entry);
  return value;
}

function classifyPayload(payload: Readonly<Record<string, unknown>>): PerceptionKind {
  const status = String(payload.status ?? "").toLowerCase();
  const category = String(payload.category ?? payload.type ?? "").toLowerCase();
  if (category.includes("security")) return "security_event";
  if (category.includes("compliance")) return "compliance_event";
  if (category.includes("performance")) return "performance_event";
  if (status.includes("fail") || status.includes("down") || status.includes("unavailable")) return "failure";
  if (status.includes("degrad") || status.includes("slow") || status.includes("warning")) return "degradation";
  if (status.includes("opportunity") || payload.opportunity === true) return "opportunity";
  if (payload.anomaly === true) return "anomaly";
  return "business_event";
}

export function perceive(snapshot: WorldStateSnapshot): readonly PerceptionSignal[] {
  const signals = snapshot.subjects.map((subject) => {
    const latest = subject.values[subject.values.length - 1] ?? {};
    const kind = subject.conflict
      ? "anomaly"
      : subject.stale
        ? "degradation"
        : classifyPayload(latest);
    const confidence = subject.conflict ? 0.55 : subject.stale ? 0.6 : 0.9;
    const reasons = [
      ...(subject.conflict ? ["conflicting_evidence"] : []),
      ...(subject.stale ? ["stale_evidence"] : []),
      ...(!subject.conflict && !subject.stale ? ["latest_evidence_classification"] : []),
    ];
    const base = {
      subject: subject.subject,
      kind,
      confidence,
      evidenceObservationIds: [...subject.observationIds],
      reasons,
    };
    return {
      ...base,
      signalId: `signal_${fingerprint(base)}`,
    };
  });
  return deepFreeze(signals);
}

export function predict(
  snapshot: WorldStateSnapshot,
  perceptions: readonly PerceptionSignal[],
): readonly Prediction[] {
  const predictions = perceptions.map((signal) => {
    const severe = signal.kind === "failure" || signal.kind === "security_event";
    const degraded = signal.kind === "degradation" || signal.kind === "compliance_event";
    const risk: RiskLevel = severe ? "high" : degraded ? "medium" : "low";
    const expectedImpact = severe ? 0.9 : degraded ? 0.6 : signal.kind === "opportunity" ? 0.7 : 0.35;
    const urgency = severe ? 1 : degraded ? 0.7 : signal.kind === "opportunity" ? 0.5 : 0.25;
    const probableOutcome = severe
      ? `${signal.subject} likely requires immediate operational attention`
      : degraded
        ? `${signal.subject} is likely to worsen without intervention`
        : signal.kind === "opportunity"
          ? `${signal.subject} may create measurable business value`
          : `${signal.subject} is likely to remain stable`;
    const base = {
      subject: signal.subject,
      probableOutcome,
      confidence: clamp(signal.confidence * (snapshot.criticalConflict ? 0.7 : 1)),
      risk,
      expectedImpact,
      urgency,
      evidenceObservationIds: [...signal.evidenceObservationIds],
    };
    return {
      ...base,
      predictionId: `prediction_${fingerprint(base)}`,
    };
  });
  return deepFreeze(predictions);
}

export function rankPlans(input: {
  readonly plans: readonly CandidatePlan[];
  readonly predictions: readonly Prediction[];
  readonly policy: EnterprisePolicyProfile;
}): readonly RankedPlan[] {
  if (input.plans.length > 0 && input.plans.length < 2) throw new Error("multiple_candidate_plans_required");
  const averageImpact = input.predictions.length
    ? input.predictions.reduce((sum, item) => sum + item.expectedImpact, 0) / input.predictions.length
    : 0;
  const averageUrgency = input.predictions.length
    ? input.predictions.reduce((sum, item) => sum + item.urgency, 0) / input.predictions.length
    : 0;

  const ranked = input.plans.map((plan) => {
    const confidence = clamp(plan.confidence);
    const risk = riskPenalty[plan.risk];
    const policyBlocked = confidence < input.policy.minimumConfidence || plan.risk === "critical";
    const score = policyBlocked
      ? -1
      : confidence * input.policy.confidenceWeight
        + averageImpact * input.policy.valueWeight
        + averageUrgency * input.policy.urgencyWeight
        - risk * input.policy.riskWeight;
    return { plan, score: Number(score.toFixed(6)) };
  }).sort((a, b) =>
    b.score - a.score
    || b.plan.confidence - a.plan.confidence
    || a.plan.risk.localeCompare(b.plan.risk)
    || a.plan.planId.localeCompare(b.plan.planId));

  return deepFreeze(ranked.map((entry, index) => ({ ...entry, rank: index + 1 })));
}

export function buildEnterpriseIntelligenceEnvelope(input: {
  readonly snapshot: WorldStateSnapshot;
  readonly plans: readonly CandidatePlan[];
  readonly policy: EnterprisePolicyProfile;
  readonly emittedAt: string;
}): EnterpriseIntelligenceEnvelopeV1 {
  if (!Number.isFinite(Date.parse(input.emittedAt))) throw new Error("invalid_emitted_at");
  const perceptions = perceive(input.snapshot);
  const predictions = predict(input.snapshot, perceptions);
  const rankedPlans = rankPlans({ plans: input.plans, predictions, policy: input.policy });
  const situationSummary = perceptions.map((signal) => `${signal.subject}: ${signal.kind}`);
  const recommendedPlanId = rankedPlans[0]?.score >= 0 ? rankedPlans[0].plan.planId : null;
  const base = {
    schemaVersion: EAE_REASONING_SCHEMA_VERSION,
    tenant: input.snapshot.tenant,
    emittedAt: input.emittedAt,
    snapshotId: input.snapshot.snapshotId,
    situationSummary,
    perceptions,
    predictions,
    rankedPlans,
    recommendedPlanId,
    boundary: "pre_cos_reasoning_only" as const,
  };
  return deepFreeze({ ...base, envelopeId: `eae_envelope_${fingerprint(base)}` });
}
