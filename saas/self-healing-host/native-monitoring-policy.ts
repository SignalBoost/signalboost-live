export type MonitoringMode = "native" | "external" | "hybrid";

export type NativeMonitoringPolicy = {
  enabledByDefault: true;
  mode: MonitoringMode;
  externalMonitoringRequired: false;
  proactive: true;
  observationOnly: true;
  signals: readonly string[];
};

/**
 * Canonical Self-Healing Supervisor monitoring contract.
 *
 * Native monitoring ships pre-staged and enabled by default. A buyer may use
 * it alone, connect an existing monitoring stack, or run both. External
 * monitoring is never a prerequisite for the Supervisor to observe its host.
 *
 * Observation itself is read-only. Findings flow into the existing incident
 * diagnosis/remediation policy: registered routine/reversible repairs may run
 * unattended; consequential mutations remain approval-gated.
 */
export const SELF_HEALING_NATIVE_MONITORING: NativeMonitoringPolicy = Object.freeze({
  enabledByDefault: true,
  mode: "native",
  externalMonitoringRequired: false,
  proactive: true,
  observationOnly: true,
  signals: Object.freeze([
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
  ]),
});

export function resolveMonitoringMode(input?: {
  nativeEnabled?: boolean;
  externalConnected?: boolean;
}): MonitoringMode {
  const nativeEnabled = input?.nativeEnabled !== false;
  const externalConnected = input?.externalConnected === true;
  if (nativeEnabled && externalConnected) return "hybrid";
  if (nativeEnabled) return "native";
  return "external";
}
