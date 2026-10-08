/**
 * Advisory Phase 1–5 observability contract, independent of runtime authority.
 * Never emit customer IDs, evidence references, document contents or secrets.
 * Caller must enforce tenant-local persistence and authenticated access.
 */
export type LabPhase = 1 | 2 | 3 | 4 | 5
export type LabObservationSource = 'synthetic_ci' | 'live_runtime' | 'independent_review'
export type LabPhaseOutcome = 'started' | 'passed' | 'failed' | 'blocked'
export type LabPhaseSignal =
  | 'factory_execution' | 'evaluation_integrity' | 'residency_disposition'
  | 'artifact_signature' | 'artifact_identity' | 'privacy_isolation'
  | 'tenant_isolation' | 'byoi_adapter' | 'portable_recovery'
  | 'budget_reservation' | 'measured_reconciliation' | 'refund_integrity'
  | 'partner_pilot' | 'rights_review' | 'security_review'
export const LAB_PHASE_SIGNALS: Readonly<Record<LabPhase,readonly LabPhaseSignal[]>> = Object.freeze({
  1: ['factory_execution','evaluation_integrity','residency_disposition'],
  2: ['artifact_signature','artifact_identity','privacy_isolation'],
  3: ['tenant_isolation','byoi_adapter','portable_recovery'],
  4: ['budget_reservation','measured_reconciliation','refund_integrity'],
  5: ['partner_pilot','rights_review','security_review'],
})
const revisionPattern = /^[a-f0-9]{7,64}$/i
const validTime = (value: string): boolean => Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value
export type LabPhaseObservation = Readonly<{
  schema: 'itmounts-lab-phase-observation-v1'
  phase: LabPhase
  signal: LabPhaseSignal
  source: LabObservationSource
  outcome: LabPhaseOutcome
  exactRevision: string
  observedAt: string
  /** An attestation must be verified out-of-band; no telemetry record self-certifies. */
  independentlyCertified: false
  productionAuthorized: false
}>
export function makeLabPhaseObservation(value: Omit<LabPhaseObservation,'schema'|'independentlyCertified'|'productionAuthorized'>): LabPhaseObservation {
  if (!(value.phase in LAB_PHASE_SIGNALS) || !(LAB_PHASE_SIGNALS[value.phase] as readonly LabPhaseSignal[] | undefined)?.includes(value.signal)) throw Error('lab_signal_phase_mismatch')
  if (!revisionPattern.test(value.exactRevision)) throw Error('lab_exact_revision_required')
  if (!validTime(value.observedAt)) throw Error('lab_observation_timestamp_invalid')
  if (!['synthetic_ci','live_runtime','independent_review'].includes(value.source)) throw Error('lab_source_invalid')
  if (!['started','passed','failed','blocked'].includes(value.outcome)) throw Error('lab_outcome_invalid')
  return Object.freeze({...value, schema:'itmounts-lab-phase-observation-v1' as const, independentlyCertified:false as const, productionAuthorized:false as const})
}
export type LabObservationSink = (event: LabPhaseObservation) => void | Promise<void>
export async function emitLabPhaseObservation(event: LabPhaseObservation, sink: LabObservationSink): Promise<void> {
  // Fail rather than claim success if telemetry delivery fails.
  await sink(makeLabPhaseObservation(event))
}
export type LabSignalHealth = 'unknown' | 'stale' | 'blocked' | 'observed'
/** Synthetic CI never counts as runtime evidence, including if it passed. */
export function assessLabPhaseHealth(
  observations: readonly LabPhaseObservation[],
  exactRevision: string,
  nowMs: number,
  maxAgeMs = 24 * 60 * 60 * 1000,
) {
  if (!revisionPattern.test(exactRevision) || !Number.isFinite(nowMs) || !Number.isFinite(maxAgeMs) || maxAgeMs <= 0) throw Error('lab_health_input_invalid')
  const phases = ([1,2,3,4,5] as const).map(phase => {
    const signals = LAB_PHASE_SIGNALS[phase].map(signal => {
      const latest = observations
        .filter(e => e.phase === phase && e.signal === signal && e.source !== 'synthetic_ci' && e.exactRevision === exactRevision && validTime(e.observedAt) && Date.parse(e.observedAt) <= nowMs)
        .sort((a,b) => Date.parse(b.observedAt) - Date.parse(a.observedAt))[0]
      const status: LabSignalHealth = !latest ? 'unknown' : nowMs - Date.parse(latest.observedAt) > maxAgeMs ? 'stale' : latest.outcome === 'failed' || latest.outcome === 'blocked' ? 'blocked' : latest.outcome === 'passed' ? 'observed' : 'unknown'
      return Object.freeze({signal,status,lastObservedAt:latest?.observedAt ?? null, source:latest?.source ?? null})
    })
    return Object.freeze({phase,signals:Object.freeze(signals),status: signals.some(s=>s.status==='blocked') ? 'blocked' : signals.some(s=>s.status==='stale') ? 'stale' : signals.some(s=>s.status==='unknown') ? 'unknown' : 'observed', certified:false as const})
  })
  return Object.freeze({exactRevision,phases:Object.freeze(phases),allObserved: phases.every(p=>p.status==='observed'),allCertified:false as const,productionAuthorized:false as const})
}
