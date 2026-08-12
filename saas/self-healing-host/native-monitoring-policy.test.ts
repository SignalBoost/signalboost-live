import assert from "node:assert/strict";
import test from "node:test";
import {
  SELF_HEALING_NATIVE_MONITORING,
  resolveMonitoringMode,
} from "./native-monitoring-policy.ts";

test("native monitoring is pre-staged and enabled by default", () => {
  assert.equal(SELF_HEALING_NATIVE_MONITORING.enabledByDefault, true);
  assert.equal(SELF_HEALING_NATIVE_MONITORING.externalMonitoringRequired, false);
  assert.equal(SELF_HEALING_NATIVE_MONITORING.proactive, true);
  assert.equal(SELF_HEALING_NATIVE_MONITORING.observationOnly, true);
  assert.equal(resolveMonitoringMode(), "native");
});

test("buyer may combine native and external monitoring", () => {
  assert.equal(
    resolveMonitoringMode({ nativeEnabled: true, externalConnected: true }),
    "hybrid",
  );
});

test("buyer may explicitly disable native monitoring when using external monitoring", () => {
  assert.equal(
    resolveMonitoringMode({ nativeEnabled: false, externalConnected: true }),
    "external",
  );
});

test("default signal pack covers proactive platform health", () => {
  for (const signal of [
    "service-health",
    "api-error-rate",
    "api-latency",
    "queue-health",
    "scheduled-job-health",
    "provider-health",
    "database-health",
    "storage-health",
    "certificate-expiry",
    "resource-pressure",
    "configuration-drift",
    "deployment-health",
  ]) {
    assert.ok(SELF_HEALING_NATIVE_MONITORING.signals.includes(signal));
  }
});
