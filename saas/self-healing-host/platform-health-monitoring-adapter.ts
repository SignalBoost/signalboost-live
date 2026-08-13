import type { Observer, ProviderObservationContext } from '../lib/supervisor/execution-contracts.ts'
import { incidentSchema, type SupervisorIncident } from '../lib/supervisor/incident-schema.ts'
import { createPlatformHealthSnapshot, type PlatformHealthInput } from '../lib/supervisor/platform-health.ts'
import type { NativeMonitoringCollector } from './native-monitoring-runtime.ts'

export type PlatformHealthInputSource = () => Promise<PlatformHealthInput> | PlatformHealthInput

export class PlatformHealthObserver implements Observer {
  constructor(private readonly inputSource: PlatformHealthInputSource) {}

  async observe(context: ProviderObservationContext): Promise<SupervisorIncident[]> {
    const input = await this.inputSource()
    const snapshot = createPlatformHealthSnapshot(input)
    return snapshot.alerts.map((alert) => incidentSchema.parse({
      incidentId: alert.alertId,
      provider: context.provider || 'signalboost-platform',
      environment: context.environment,
      severity: alert.severity === 'critical' ? 'critical' : 'warning',
      detectedAt: alert.occurredAt,
      source: 'cron',
      errorCode: alert.type,
      errorMessage: alert.message,
      affectedResource: alert.subsystemId,
      evidence: [{
        evidenceId: `${alert.alertId}:platform-health`,
        type: 'platform_health_snapshot',
        capturedAt: snapshot.capturedAt,
        summary: `${alert.message} Platform health score ${snapshot.score}; subsystem ${alert.subsystemId}.`,
        reference: snapshot.snapshotId,
      }],
      metadata: {
        monitoringMode: 'native',
        observationOnly: true,
        platformHealthStatus: snapshot.status,
        platformHealthScore: snapshot.score,
        subsystemId: alert.subsystemId,
        alertType: alert.type,
        evidence: alert.evidence.slice(0, 20),
        schemaVersion: snapshot.schemaVersion,
      },
    }))
  }
}

export function platformHealthNativeMonitoringCollector(inputSource: PlatformHealthInputSource): NativeMonitoringCollector {
  return {
    id: 'signalboost-platform-health',
    signals: ['queue-health', 'scheduled-job-health', 'provider-health', 'resource-pressure'],
    observer: new PlatformHealthObserver(inputSource),
  }
}
