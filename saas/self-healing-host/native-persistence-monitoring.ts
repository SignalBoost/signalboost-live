import { randomUUID } from 'node:crypto'
import type { Observer, ProviderObservationContext } from '@/lib/supervisor/execution-contracts'
import { incidentSchema, type SerializableValue, type SupervisorIncident } from '@/lib/supervisor/incident-schema'
import type { NativeMonitoringCollector } from './native-monitoring-runtime'

/**
 * Reuse the existing native-probe table rather than requiring privileged schema changes.
 * The target distinguishes this controlled write/read proof from ordinary DB-health samples.
 */
export const PERSISTENCE_PROBE_ID = 'database' as const
export const PERSISTENCE_PROBE_TARGET = 'self-healing:persistence-roundtrip'
export const CONFIDENCE_INVESTIGATION_TARGET = 'self-healing:confidence-investigation'
export const PERSISTENCE_EVIDENCE_MAX_AGE_MS = 2 * 60 * 60 * 1000

export interface PersistenceMonitoringOptions {
  db: any
  target?: string
  warningLatencyMs?: number
  criticalLatencyMs?: number
  now?: () => Date
}

function persistenceIncident(input: {
  context: ProviderObservationContext
  at: string
  target: string
  severity: 'warning' | 'critical'
  code: string
  message: string
  summary: string
  metadata?: Record<string, SerializableValue>
}): SupervisorIncident {
  const bucket = Math.floor(Date.parse(input.at) / 1_800_000)
  return incidentSchema.parse({
    incidentId: `native-persistence-${bucket}`,
    provider: input.context.provider || 'signalboost-platform',
    environment: input.context.environment,
    severity: input.severity,
    detectedAt: input.at,
    source: 'cron',
    errorCode: input.code,
    errorMessage: input.message,
    affectedResource: input.target,
    evidence: [{
      evidenceId: `native-persistence-${bucket}:probe`,
      type: 'native_persistence_probe',
      capturedAt: input.at,
      summary: input.summary,
      reference: input.target,
    }],
    metadata: {
      monitoringMode: 'native',
      observationOnly: true,
      nativeProbe: 'persistence',
      ...(input.metadata ?? {}),
    },
  })
}

async function markSample(db: any, id: unknown, status: 'healthy' | 'error', details: Record<string, unknown>): Promise<string | null> {
  const { error } = await db.from('self_healing_native_probe_samples').update({ status, details }).eq('id', id)
  return error ? String(error.message || 'persistence sample update failed').slice(0, 220) : null
}

/**
 * Proves persistence rather than inferring it from a neighbouring metric:
 * 1. write a unique nonce into the existing durable native-probe table as pending evidence;
 * 2. issue a separate SELECT for that exact row and compare the nonce;
 * 3. only then promote the durable sample to healthy.
 *
 * A failed/mismatched read never leaves a healthy persistence record behind.
 */
export class PersistenceHealthObserver implements Observer {
  private readonly now: () => Date
  constructor(private readonly options: PersistenceMonitoringOptions) {
    this.now = options.now ?? (() => new Date())
  }

  async observe(context: ProviderObservationContext): Promise<SupervisorIncident[]> {
    const at = this.now().toISOString()
    const target = this.options.target ?? PERSISTENCE_PROBE_TARGET
    const nonce = randomUUID()
    const started = performance.now()

    const pendingDetails = { probeKind: 'persistence_roundtrip', nonce, verification: 'pending' }
    const { data: inserted, error: insertError } = await this.options.db
      .from('self_healing_native_probe_samples')
      .insert({
        probe_id: PERSISTENCE_PROBE_ID,
        target,
        observed_at: at,
        status: 'warning',
        latency_ms: null,
        error_rate: 0,
        metric_value: 0,
        metric_unit: 'roundtrip_ok',
        details: pendingDetails,
      })
      .select('id')
      .single()

    if (insertError || inserted?.id == null) {
      const latencyMs = Math.round(performance.now() - started)
      const reason = String(insertError?.message || 'durable probe row was not created').slice(0, 220)
      return [persistenceIncident({
        context, at, target, severity: 'critical', code: 'native_persistence_write_failed',
        message: 'The durable persistence write failed.',
        summary: `A controlled persistence write failed after ${latencyMs} ms: ${reason}`,
        metadata: { latencyMs, roundtripOk: false },
      })]
    }

    const { data: readBack, error: readError } = await this.options.db
      .from('self_healing_native_probe_samples')
      .select('id,details')
      .eq('id', inserted.id)
      .maybeSingle()

    const observedNonce = readBack?.details && typeof readBack.details === 'object'
      ? String((readBack.details as Record<string, unknown>).nonce ?? '')
      : ''
    const roundtripOk = !readError && readBack?.id === inserted.id && observedNonce === nonce
    const latencyMs = Math.round(performance.now() - started)

    if (!roundtripOk) {
      const reason = String(readError?.message || 'separate read did not return the written nonce').slice(0, 220)
      await markSample(this.options.db, inserted.id, 'error', {
        probeKind: 'persistence_roundtrip', nonce, verification: 'read_back_failed', failure: reason,
      })
      return [persistenceIncident({
        context, at, target, severity: 'critical', code: 'native_persistence_roundtrip_failed',
        message: 'The durable persistence write/read round-trip failed.',
        summary: `The row was written but a separate read could not prove the same nonce after ${latencyMs} ms: ${reason}`,
        metadata: { latencyMs, roundtripOk: false },
      })]
    }

    const updateError = await markSample(this.options.db, inserted.id, 'healthy', {
      probeKind: 'persistence_roundtrip', nonce, verification: 'read_back_verified', verifiedAt: this.now().toISOString(),
    })
    if (updateError) {
      return [persistenceIncident({
        context, at, target, severity: 'warning', code: 'native_persistence_evidence_finalize_failed',
        message: 'Persistence was verified, but its evidence record could not be finalized.',
        summary: `The write/read round-trip succeeded in ${latencyMs} ms, but finalizing the proof failed: ${updateError}`,
        metadata: { latencyMs, roundtripOk: true, evidenceFinalized: false },
      })]
    }

    const warning = this.options.warningLatencyMs ?? 750
    const critical = this.options.criticalLatencyMs ?? 2000
    if (latencyMs < warning) return []
    const severity = latencyMs >= critical ? 'critical' : 'warning'
    return [persistenceIncident({
      context, at, target, severity, code: 'native_persistence_latency',
      message: `Durable persistence round-trip latency is ${latencyMs} ms.`,
      summary: `A real write plus separate read completed successfully; latency crossed the ${severity} threshold.`,
      metadata: { latencyMs, roundtripOk: true, evidenceFinalized: true },
    })]
  }
}

export function persistenceNativeMonitoringCollector(options: PersistenceMonitoringOptions): NativeMonitoringCollector {
  return { id: 'native-persistence-health', signals: ['persistence-health'], observer: new PersistenceHealthObserver(options) }
}
