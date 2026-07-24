import assert from "node:assert/strict";
import test from "node:test";

import {
  buildEnterpriseIntelligenceEnvelope,
  buildWorldState,
  EAE_SCHEMA_VERSION,
  rankPlans,
  type CandidatePlan,
  type EnterprisePolicyProfile,
  type Observation,
} from "../lib/autonomous-systems/index.ts";

const tenant = { tenantId: "buyer-a", environmentId: "production", region: "us-east" };
const now = "2026-07-24T03:00:00.000Z";

function observation(overrides: Partial<Observation> = {}): Observation {
  return {
    schemaVersion: EAE_SCHEMA_VERSION,
    observationId: "obs-1",
    tenant,
    source: "buyer-erp",
    subject: "orders.backlog",
    observedAt: "2026-07-24T02:59:30.000Z",
    receivedAt: "2026-07-24T02:59:31.000Z",
    critical: false,
    payload: { status: "degraded", count: 42 },
    ...overrides,
  };
}

const plans: readonly CandidatePlan[] = [
  {
    planId: "plan-observe",
    title: "Increase observation frequency",
    mutating: false,
    consequential: false,
    risk: "low",
    confidence: 0.82,
    evidenceObservationIds: ["obs-1"],
    steps: ["collect_more_metrics"],
    verification: ["backlog_trend_confirmed"],
    rollbackRequired: false,
  },
  {
    planId: "plan-escalate",
    title: "Escalate to operations",
    mutating: false,
    consequential: true,
    risk: "medium",
    confidence: 0.91,
    evidenceObservationIds: ["obs-1"],
    steps: ["request_operations_review"],
    verification: ["operations_acknowledged"],
    rollbackRequired: false,
  },
];

const policy: EnterprisePolicyProfile = {
  riskTolerance: "low",
  minimumConfidence: 0.6,
  valueWeight: 0.3,
  confidenceWeight: 0.5,
  riskWeight: 0.4,
  urgencyWeight: 0.2,
};

test("builds deterministic immutable pre-COS intelligence envelopes", () => {
  const snapshot = buildWorldState({ tenant, observations: [observation()], now, staleAfterMs: 60_000 });
  const first = buildEnterpriseIntelligenceEnvelope({ snapshot, plans, policy, emittedAt: now });
  const second = buildEnterpriseIntelligenceEnvelope({ snapshot, plans, policy, emittedAt: now });

  assert.deepEqual(first, second);
  assert.equal(first.boundary, "pre_cos_reasoning_only");
  assert.equal(first.perceptions[0].kind, "degradation");
  assert.equal(first.predictions[0].risk, "medium");
  assert.equal(first.rankedPlans.length, 2);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.rankedPlans), true);
  assert.doesNotThrow(() => JSON.stringify(first));
});

test("requires multiple candidate plans", () => {
  const snapshot = buildWorldState({ tenant, observations: [observation()], now, staleAfterMs: 60_000 });
  assert.throws(
    () => buildEnterpriseIntelligenceEnvelope({ snapshot, plans: [plans[0]], policy, emittedAt: now }),
    /multiple_candidate_plans_required/,
  );
});

test("ranks plans deterministically and blocks critical risk", () => {
  const critical: CandidatePlan = { ...plans[0], planId: "plan-critical", risk: "critical", confidence: 1 };
  const ranked = rankPlans({
    plans: [critical, ...plans],
    predictions: [],
    policy,
  });
  assert.equal(ranked[ranked.length - 1].plan.planId, "plan-critical");
  assert.equal(ranked[ranked.length - 1].score, -1);
});

test("keeps tenant identity unchanged through the pre-COS boundary", () => {
  const snapshot = buildWorldState({ tenant, observations: [observation()], now, staleAfterMs: 60_000 });
  const envelope = buildEnterpriseIntelligenceEnvelope({ snapshot, plans, policy, emittedAt: now });
  assert.deepEqual(envelope.tenant, tenant);
  assert.equal(envelope.snapshotId, snapshot.snapshotId);
});
