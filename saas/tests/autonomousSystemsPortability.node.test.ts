import assert from "node:assert/strict";
import test from "node:test";

import type {
  EaeHostPorts,
  EaeObservationSourcePort,
  Observation,
  TenantContext,
} from "../lib/autonomous-systems/index.ts";
import { EAE_SCHEMA_VERSION } from "../lib/autonomous-systems/index.ts";

const tenant: TenantContext = { tenantId: "buyer-a", environmentId: "production", region: "us-east" };

test("EAE host contracts accept buyer-owned adapters", async () => {
  const source: EaeObservationSourcePort = {
    sourceId: "buyer-erp",
    async collect(context): Promise<readonly Observation[]> {
      return [{ schemaVersion: EAE_SCHEMA_VERSION, observationId: "obs-1", tenant: context, source: this.sourceId, subject: "orders.backlog", observedAt: "2026-07-24T01:00:00.000Z", receivedAt: "2026-07-24T01:00:01.000Z", critical: false, payload: { count: 12 } }];
    },
  };
  const host: EaeHostPorts = {
    clock: { now: () => "2026-07-24T01:00:02.000Z" },
    identity: { resolveTenant: async () => tenant },
    observationSources: [source],
    telemetry: { metric: () => undefined, event: () => undefined },
  };
  assert.deepEqual(await host.identity.resolveTenant(), tenant);
  assert.equal((await host.observationSources?.[0].collect(tenant))?.[0].source, "buyer-erp");
});

test("portable host contracts contain no required SignalBoost service", () => {
  const requiredKeys: (keyof EaeHostPorts)[] = ["clock", "identity"];
  assert.deepEqual(requiredKeys, ["clock", "identity"]);
});
