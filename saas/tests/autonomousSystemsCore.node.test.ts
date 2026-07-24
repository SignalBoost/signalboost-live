import assert from "node:assert/strict";
import test from "node:test";

import {
  buildDecisionPackage,
  buildWorldState,
  CandidatePlan,
  EAE_SCHEMA_VERSION,
  Observation,
} from "../lib/autonomous-systems/index.ts";

const tenant = { tenantId: "buyer-a", environmentId: "production", region: "us-east" };
const now = "2026-07-24T01:00:00.000Z";

function observation(overrides: Partial<Observation> = {}): Observation {
  return {
    schemaVersion: EAE_SCHEMA_VERSION,
    observationId: "obs-1",
    tenant,
    source: "buyer-adapter",
    subject: "video.pipeline.health",
    observedAt: "2026-07-24T00:59:30.000Z",
    receivedAt: "2026-07-24T00:59:31.000Z",
    critical: true,
    payload: { status: "healthy", queueDepth: 2 },
    ...overrides,
  };
}

const safePlan: CandidatePlan = {
  planId: "plan-1",
  title: "Recommend additional observation",
  mutating: false,
  consequential: false,
  risk: "low",
  confidence: 0.91,
  evidenceObservationIds: ["obs-1"],
  steps: ["collect_more_metrics"],
  verification: ["queue_depth_remains_below_10"],
  rollbackRequired: false,
};

test("builds deterministic immutable decision packages", () => {
  const snapshotA = buildWorldState({ tenant, observations: [observation()], now, staleAfterMs: 60_000 });
  const snapshotB = buildWorldState({ tenant, observations: [observation()], now, staleAfterMs: 60_000 });
  const decisionA = buildDecisionPackage({ snapshot: snapshotA, selectedPlan: safePlan, now });
  const decisionB = buildDecisionPackage({ snapshot: snapshotB, selectedPlan: safePlan, now });

  assert.deepEqual(decisionA, decisionB);
  assert.equal(decisionA.disposition, "recommend");
  assert.equal(Object.isFrozen(decisionA), true);
  assert.equal(Object.isFrozen(decisionA.snapshot.subjects), true);
  assert.doesNotThrow(() => JSON.stringify(decisionA));
});

test("requires approval for mutating or consequential plans", () => {
  const snapshot = buildWorldState({ tenant, observations: [observation()], now, staleAfterMs: 60_000 });
  const decision = buildDecisionPackage({ snapshot, selectedPlan: { ...safePlan, mutating: true, consequential: true }, now });
  assert.equal(decision.disposition, "approval_required");
});

test("fails closed on stale critical evidence", () => {
  const snapshot = buildWorldState({ tenant, observations: [observation({ observedAt: "2026-07-23T22:00:00.000Z" })], now, staleAfterMs: 60_000 });
  const decision = buildDecisionPackage({ snapshot, selectedPlan: safePlan, now });
  assert.equal(decision.disposition, "blocked");
  assert.ok(decision.reasons.includes("critical_evidence_stale"));
});

test("represents conflicts instead of overwriting evidence", () => {
  const snapshot = buildWorldState({ tenant, observations: [observation(), observation({ observationId: "obs-2", payload: { status: "failed", queueDepth: 42 } })], now, staleAfterMs: 60_000 });
  assert.equal(snapshot.subjects[0].conflict, true);
  assert.equal(snapshot.subjects[0].values.length, 2);
  assert.equal(buildDecisionPackage({ snapshot, selectedPlan: safePlan, now }).disposition, "blocked");
});

test("rejects tenant boundary violations and secret fields", () => {
  assert.throws(() => buildWorldState({ tenant, observations: [observation({ tenant: { tenantId: "buyer-b", environmentId: "production" } })], now, staleAfterMs: 60_000 }), /tenant_boundary_violation/);
  assert.throws(() => buildWorldState({ tenant, observations: [observation({ payload: { apiKey: "must-not-enter-core" } })], now, staleAfterMs: 60_000 }), /secret_field_rejected/);
});
