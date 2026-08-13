import type { Observer, ProviderObservationContext } from '../lib/supervisor/execution-contracts.ts'
import type { SupervisorIncident } from '../lib/supervisor/incident-schema.ts'
import { SELF_HEALING_NATIVE_MONITORING, resolveMonitoringMode, type NativeMonitoringSignal } from './native-monitoring-policy.ts'

export interface NativeMonitoringCollector {
  readonly id: string
  readonly signals: readonly NativeMonitoringSignal[]
  readonly observer: Observer
}

export type NativeMonitoringRunResult = {
  mode: ReturnType<typeof resolveMonitoringMode>
  readOnly: true
  providerMutations: false
  collectorsRun: string[]
  signalsObserved: NativeMonitoringSignal[]
  incidents: SupervisorIncident[]
  collectorErrors: Array<{ collectorId: string; error: string }>
}

/**
 * Runs native read-only collectors through the same Observer contract used by
 * the Supervisor. It deliberately does not execute repair plans or provider
 * mutations; incidents continue through the existing diagnosis/policy path.
 */
export async function runNativeMonitoring(input: {
  context: ProviderObservationContext
  collectors: readonly NativeMonitoringCollector[]
  nativeEnabled?: boolean
  externalConnected?: boolean
}): Promise<NativeMonitoringRunResult> {
  const mode = resolveMonitoringMode(input)
  const result: NativeMonitoringRunResult = {
    mode,
    readOnly: true,
    providerMutations: false,
    collectorsRun: [],
    signalsObserved: [],
    incidents: [],
    collectorErrors: [],
  }

  if (input.nativeEnabled === false) return result

  const allowed = new Set<NativeMonitoringSignal>(SELF_HEALING_NATIVE_MONITORING.signals)
  for (const collector of input.collectors) {
    const signals = collector.signals.filter(signal => allowed.has(signal))
    if (signals.length === 0) continue
    result.collectorsRun.push(collector.id)
    for (const signal of signals) if (!result.signalsObserved.includes(signal)) result.signalsObserved.push(signal)
    try {
      const incidents = await collector.observer.observe({
        ...input.context,
        metadata: {
          ...(input.context.metadata ?? {}),
          monitoringMode: mode,
          monitoringCollector: collector.id,
          observationOnly: true,
        },
      })
      result.incidents.push(...incidents)
    } catch (error) {
      result.collectorErrors.push({
        collectorId: collector.id,
        error: error instanceof Error ? error.message.slice(0, 240) : 'collector_failed',
      })
    }
  }
  return result
}

/** Adapter for the existing production Vercel observer. */
export function vercelNativeMonitoringCollector(observer: Observer): NativeMonitoringCollector {
  return {
    id: 'vercel-deployment-health',
    signals: ['deployment-health', 'provider-health'],
    observer,
  }
}
