export type MonitoringMode = "native" | "external" | "hybrid";

export type NativeMonitoringSignal =
  | "service-health"
  | "api-error-rate"
  | "api-latency"
  | "queue-health"
  | "scheduled-job-health"
  | "provider-health"
  | "database-health"
  | "storage-health"
  | "persistence-health"
  | "certificate-expiry"
  | "resource-pressure"
  | "configuration-drift"
  | "deployment-health";

export type NativeMonitoringPolicy = {
  enabledByDefault: true;
  mode: MonitoringMode;
  externalMonitoringRequired: false;
  proactive: true;
  observationOnly: true;
  signals: readonly NativeMonitoringSignal[];
};

/** Canonical Self-Healing Supervisor monitoring contract. */
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
    "persistence-health",
    "certificate-expiry",
    "resource-pressure",
    "configuration-drift",
    "deployment-health",
  ] as NativeMonitoringSignal[]),
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
