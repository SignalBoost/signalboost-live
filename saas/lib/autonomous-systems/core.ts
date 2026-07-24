import {
  CandidatePlan,
  DecisionPackage,
  EAE_SCHEMA_VERSION,
  Observation,
  PolicyDisposition,
  TenantContext,
  WorldStateSnapshot,
} from "./types.ts";

const SECRET_PATTERN = /(api[_-]?key|authorization|bearer|password|private[_-]?key|secret|token)/i;

function assertText(value: string, name: string): void {
  if (!value.trim()) throw new Error(`${name}_required`);
}

function assertTenant(tenant: TenantContext): void {
  assertText(tenant.tenantId, "tenant_id");
  assertText(tenant.environmentId, "environment_id");
}

function assertJsonSafe(value: unknown, path = "payload"): void {
  if (typeof value === "function" || typeof value === "symbol" || typeof value === "bigint") {
    throw new Error(`${path}_not_json_serializable`);
  }
  if (typeof value === "number" && !Number.isFinite(value)) {
    throw new Error(`${path}_non_finite_number`);
  }
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertJsonSafe(entry, `${path}[${index}]`));
    return;
  }
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (SECRET_PATTERN.test(key)) throw new Error(`${path}_secret_field_rejected`);
    assertJsonSafe(entry, `${path}.${key}`);
  }
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

export function buildWorldState(input: {
  tenant: TenantContext;
  observations: readonly Observation[];
  now: string;
  staleAfterMs: number;
}): WorldStateSnapshot {
  assertTenant(input.tenant);
  const nowMs = Date.parse(input.now);
  if (!Number.isFinite(nowMs)) throw new Error("invalid_now");
  if (!Number.isFinite(input.staleAfterMs) || input.staleAfterMs < 0) {
    throw new Error("invalid_stale_after_ms");
  }

  const seen = new Set<string>();
  const grouped = new Map<string, Observation[]>();
  for (const observation of input.observations) {
    if (observation.schemaVersion !== EAE_SCHEMA_VERSION) throw new Error("unsupported_schema");
    assertTenant(observation.tenant);
    if (
      observation.tenant.tenantId !== input.tenant.tenantId ||
      observation.tenant.environmentId !== input.tenant.environmentId
    ) throw new Error("tenant_boundary_violation");
    assertText(observation.observationId, "observation_id");
    assertText(observation.source, "source");
    assertText(observation.subject, "subject");
    if (seen.has(observation.observationId)) throw new Error("duplicate_observation_id");
    seen.add(observation.observationId);
    assertJsonSafe(observation.payload);
    if (!Number.isFinite(Date.parse(observation.observedAt))) throw new Error("invalid_observed_at");
    const current = grouped.get(observation.subject) ?? [];
    current.push(observation);
    grouped.set(observation.subject, current);
  }

  const subjects = [...grouped.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([subject, observations]) => {
      const ordered = [...observations].sort((a, b) =>
        a.observedAt.localeCompare(b.observedAt) || a.observationId.localeCompare(b.observationId));
      const latest = ordered[ordered.length - 1];
      const uniqueValues = new Set(ordered.map((entry) => canonical(entry.payload)));
      return {
        subject,
        observationIds: ordered.map((entry) => entry.observationId),
        latestObservedAt: latest.observedAt,
        conflict: uniqueValues.size > 1,
        stale: nowMs - Date.parse(latest.observedAt) > input.staleAfterMs,
        values: ordered.map((entry) => entry.payload),
      };
    });

  const criticalIds = new Set(input.observations.filter((item) => item.critical).map((item) => item.observationId));
  const criticalSubjects = subjects.filter((subject) =>
    subject.observationIds.some((id) => criticalIds.has(id)));

  const snapshotBase = {
    schemaVersion: EAE_SCHEMA_VERSION,
    tenant: input.tenant,
    generatedAt: input.now,
    subjects,
    criticalConflict: criticalSubjects.some((subject) => subject.conflict),
    criticalStaleness: criticalSubjects.some((subject) => subject.stale),
  };

  return deepFreeze({
    ...snapshotBase,
    snapshotId: `snapshot_${fingerprint(snapshotBase)}`,
  });
}

function dispositionFor(snapshot: WorldStateSnapshot, plan: CandidatePlan | null): PolicyDisposition {
  if (snapshot.criticalConflict || snapshot.criticalStaleness) return "blocked";
  if (!plan) return "observe_only";
  if (!Number.isFinite(plan.confidence) || plan.confidence < 0 || plan.confidence > 1) return "blocked";
  if (plan.risk === "critical") return "blocked";
  if (plan.mutating || plan.consequential || plan.risk === "high") return "approval_required";
  return "recommend";
}

export function buildDecisionPackage(input: {
  snapshot: WorldStateSnapshot;
  selectedPlan?: CandidatePlan | null;
  now: string;
}): DecisionPackage {
  const plan = input.selectedPlan ?? null;
  if (plan) {
    assertText(plan.planId, "plan_id");
    assertText(plan.title, "plan_title");
    assertJsonSafe(plan);
    const availableEvidence = new Set(input.snapshot.subjects.flatMap((item) => item.observationIds));
    if (plan.evidenceObservationIds.some((id) => !availableEvidence.has(id))) {
      throw new Error("unknown_evidence_observation");
    }
  }

  const disposition = dispositionFor(input.snapshot, plan);
  const reasons = [
    ...(input.snapshot.criticalConflict ? ["critical_evidence_conflict"] : []),
    ...(input.snapshot.criticalStaleness ? ["critical_evidence_stale"] : []),
    ...(plan?.risk === "critical" ? ["critical_plan_risk"] : []),
    ...(plan && (plan.mutating || plan.consequential) ? ["human_approval_required"] : []),
    ...(!plan ? ["no_plan_selected"] : []),
  ];
  const base = {
    schemaVersion: EAE_SCHEMA_VERSION,
    tenant: input.snapshot.tenant,
    generatedAt: input.now,
    snapshot: input.snapshot,
    selectedPlan: plan,
    disposition,
    reasons,
  };

  assertJsonSafe(base);
  return deepFreeze({ ...base, decisionId: `decision_${fingerprint(base)}` });
}
