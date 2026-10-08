import { assessLabPhaseHealth, type LabPhaseObservation, type LabPhase } from './labAllPhasesObservability.ts'

/** Tenant-local supervisor incident signal. Never conveys tenant/customer data or grants repair authority. */
export type LabSupervisorAlert = Readonly<{
  code: 'lab_phase_signal_unknown' | 'lab_phase_signal_stale' | 'lab_phase_signal_blocked'
  phase: LabPhase
  signal: string
  exactRevision: string
  severity: 'warning' | 'high'
}>
export type LabSupervisorAlertSink = (alert: LabSupervisorAlert) => Promise<void> | void

/** Trusted host must bind a tenant-local durable observation reader and a governed supervisor intake. */
export async function dispatchLabHealthAlerts(
  events: readonly LabPhaseObservation[],
  revision: string,
  nowMs: number,
  sink: LabSupervisorAlertSink,
) {
  const health = assessLabPhaseHealth(events, revision, nowMs)
  const alerts: LabSupervisorAlert[] = []
  for (const phase of health.phases) for (const signal of phase.signals) {
    if (signal.status === 'observed') continue
    const code = signal.status === 'stale' ? 'lab_phase_signal_stale' : signal.status === 'blocked' ? 'lab_phase_signal_blocked' : 'lab_phase_signal_unknown'
    alerts.push(Object.freeze({code,phase:phase.phase,signal:signal.signal,exactRevision:revision,severity: signal.status === 'blocked' ? 'high' : 'warning'}))
  }
  // Do not swallow delivery failure or declare a successful check without alert acknowledgement.
  for (const alert of alerts) await sink(alert)
  return Object.freeze({health,alerts:Object.freeze(alerts),delivered:alerts.length})
}
