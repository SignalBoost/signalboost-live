import { connect as tlsConnect } from 'node:tls'
import type { Observer, ProviderObservationContext } from '../lib/supervisor/execution-contracts.ts'
import { incidentSchema, type SerializableValue, type SupervisorIncident } from '../lib/supervisor/incident-schema.ts'
import type { NativeMonitoringCollector } from './native-monitoring-runtime.ts'

export type NativeProbeStatus = 'healthy' | 'warning' | 'critical' | 'error'

export interface NativeProbeSample {
  probeId: 'api' | 'database' | 'storage' | 'certificate'
  target: string
  observedAt: string
  status: NativeProbeStatus
  latencyMs?: number | null
  errorRate?: number | null
  metricValue?: number | null
  metricUnit?: string | null
  details: Record<string, SerializableValue>
}

export interface NativeProbeStore {
  history(probeId: NativeProbeSample['probeId'], target: string, limit?: number): Promise<NativeProbeSample[]>
  save(sample: NativeProbeSample): Promise<void>
}

export class SupabaseNativeProbeStore implements NativeProbeStore {
  constructor(private readonly db: any) {}

  async verifySchema(): Promise<void> {
    const { error } = await this.db
      .from('self_healing_native_probe_samples')
      .select('id', { head: true, count: 'exact' })
      .limit(1)
    if (error) throw new Error(`native_probe_store_unavailable:${String(error.message || 'unknown').slice(0, 160)}`)
  }

  async history(probeId: NativeProbeSample['probeId'], target: string, limit = 24): Promise<NativeProbeSample[]> {
    const { data, error } = await this.db
      .from('self_healing_native_probe_samples')
      .select('probe_id,target,observed_at,status,latency_ms,error_rate,metric_value,metric_unit,details')
      .eq('probe_id', probeId)
      .eq('target', target)
      .order('observed_at', { ascending: false })
      .limit(Math.min(Math.max(limit, 1), 96))
    if (error) throw new Error(`native_probe_history_failed:${String(error.message || 'unknown').slice(0, 160)}`)
    return (data ?? []).map((row: any) => ({
      probeId: row.probe_id,
      target: row.target,
      observedAt: row.observed_at,
      status: row.status,
      latencyMs: row.latency_ms == null ? null : Number(row.latency_ms),
      errorRate: row.error_rate == null ? null : Number(row.error_rate),
      metricValue: row.metric_value == null ? null : Number(row.metric_value),
      metricUnit: row.metric_unit ?? null,
      details: row.details ?? {},
    }))
  }

  async save(sample: NativeProbeSample): Promise<void> {
    const { error } = await this.db.from('self_healing_native_probe_samples').insert({
      probe_id: sample.probeId,
      target: sample.target,
      observed_at: sample.observedAt,
      status: sample.status,
      latency_ms: sample.latencyMs ?? null,
      error_rate: sample.errorRate ?? null,
      metric_value: sample.metricValue ?? null,
      metric_unit: sample.metricUnit ?? null,
      details: sample.details,
    })
    if (error) throw new Error(`native_probe_sample_save_failed:${String(error.message || 'unknown').slice(0, 160)}`)
  }
}

type Thresholds = { warning: number; critical: number }

export interface ApiProbeOptions {
  urls: readonly string[]
  store: NativeProbeStore
  samplesPerUrl?: number
  timeoutMs?: number
  latencyMs?: Thresholds
  errorRate?: Thresholds
  trendMultiplier?: number
  fetchImpl?: typeof fetch
  now?: () => Date
}

export interface DatabaseProbeOptions {
  db: any
  store: NativeProbeStore
  target?: string
  latencyMs?: Thresholds
  connectionPressurePct?: Thresholds
  now?: () => Date
}

export interface StorageProbeOptions {
  db: any
  store: NativeProbeStore
  target?: string
  quotaBytes?: number | null
  latencyMs?: Thresholds
  capacityPct?: Thresholds
  now?: () => Date
}

export interface CertificateTarget {
  host: string
  port?: number
}

export interface CertificateProbeOptions {
  targets: readonly CertificateTarget[]
  store: NativeProbeStore
  expiryDays?: Thresholds
  timeoutMs?: number
  now?: () => Date
  inspectCertificate?: (target: CertificateTarget, timeoutMs: number) => Promise<{ validTo: string; subject?: string; issuer?: string }>
}

const finite = (value: unknown): number | null => {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), max)
const round = (value: number, digits = 2): number => Number(value.toFixed(digits))

export function percentile95(values: readonly number[]): number {
  const sorted = values.filter(Number.isFinite).slice().sort((a, b) => a - b)
  if (!sorted.length) return 0
  return sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)]
}

function average(values: readonly number[]): number | null {
  const valid = values.filter(Number.isFinite)
  return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : null
}

function safeTarget(value: string): string {
  try {
    const url = new URL(value)
    return `${url.protocol}//${url.host}${url.pathname}`.slice(0, 220)
  } catch {
    return value.slice(0, 220)
  }
}

function simpleHash(value: string): string {
  let hash = 0
  for (const char of value) hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0
  return Math.abs(hash).toString(36)
}

function incidentId(kind: string, target: string, observedAt: string): string {
  const bucket = Math.floor(Date.parse(observedAt) / (15 * 60 * 1000))
  return `native-${kind}-${simpleHash(target)}-${bucket}`
}

function severityFor(value: number, thresholds: Thresholds): 'info' | 'warning' | 'critical' {
  if (value >= thresholds.critical) return 'critical'
  if (value >= thresholds.warning) return 'warning'
  return 'info'
}

function lowerIsWorse(value: number, thresholds: Thresholds): 'info' | 'warning' | 'critical' {
  if (value <= thresholds.critical) return 'critical'
  if (value <= thresholds.warning) return 'warning'
  return 'info'
}

function statusFromSeverity(severity: 'info' | 'warning' | 'critical'): NativeProbeStatus {
  return severity === 'critical' ? 'critical' : severity === 'warning' ? 'warning' : 'healthy'
}

function makeIncident(input: {
  context: ProviderObservationContext
  kind: string
  target: string
  observedAt: string
  severity: 'warning' | 'critical'
  errorCode: string
  message: string
  evidenceType: string
  evidenceSummary: string
  metadata: Record<string, SerializableValue>
}): SupervisorIncident {
  return incidentSchema.parse({
    incidentId: incidentId(input.kind, input.target, input.observedAt),
    provider: input.context.provider || 'signalboost-platform',
    environment: input.context.environment,
    severity: input.severity,
    detectedAt: input.observedAt,
    source: 'cron',
    errorCode: input.errorCode,
    errorMessage: input.message,
    affectedResource: safeTarget(input.target),
    evidence: [{
      evidenceId: `${incidentId(input.kind, input.target, input.observedAt)}:probe`,
      type: input.evidenceType,
      capturedAt: input.observedAt,
      summary: input.evidenceSummary.slice(0, 1000),
      reference: safeTarget(input.target),
    }],
    metadata: {
      monitoringMode: 'native',
      observationOnly: true,
      nativeProbe: input.kind,
      ...input.metadata,
    },
  })
}

export class ApiHealthObserver implements Observer {
  private readonly fetchImpl: typeof fetch
  private readonly now: () => Date

  constructor(private readonly options: ApiProbeOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch
    this.now = options.now ?? (() => new Date())
  }

  async observe(context: ProviderObservationContext): Promise<SupervisorIncident[]> {
    const incidents: SupervisorIncident[] = []
    const samplesPerUrl = clamp(Math.round(this.options.samplesPerUrl ?? 5), 1, 10)
    const timeoutMs = clamp(Math.round(this.options.timeoutMs ?? 8000), 1000, 30000)
    const latencyThresholds = this.options.latencyMs ?? { warning: 1500, critical: 3000 }
    const errorThresholds = this.options.errorRate ?? { warning: 0.05, critical: 0.20 }
    const trendMultiplier = Math.max(1.1, this.options.trendMultiplier ?? 1.75)

    for (const rawUrl of this.options.urls) {
      const target = safeTarget(rawUrl)
      const observedAt = this.now().toISOString()
      const durations: number[] = []
      const statuses: number[] = []
      let failures = 0

      for (let index = 0; index < samplesPerUrl; index += 1) {
        const started = performance.now()
        try {
          const response = await this.fetchImpl(rawUrl, {
            method: 'GET',
            cache: 'no-store',
            redirect: 'follow',
            signal: AbortSignal.timeout(timeoutMs),
            headers: { 'user-agent': 'SignalBoost-Self-Healing-Native-Probe/1.0' },
          })
          durations.push(performance.now() - started)
          statuses.push(response.status)
          if (response.status >= 500) failures += 1
          try { await response.body?.cancel() } catch {}
        } catch {
          durations.push(performance.now() - started)
          statuses.push(0)
          failures += 1
        }
      }

      const p95Ms = Math.round(percentile95(durations))
      const errorRate = failures / samplesPerUrl
      const history = await this.options.store.history('api', target, 24)
      const priorLatency = history.map(sample => finite(sample.latencyMs)).filter((value): value is number => value != null && value > 0)
      const baselineP95 = priorLatency.length >= 3 ? average(priorLatency.slice(0, 12)) : null
      const latencySeverity = severityFor(p95Ms, latencyThresholds)
      const errorSeverity = severityFor(errorRate, errorThresholds)
      const trendDegraded = baselineP95 != null && p95Ms >= baselineP95 * trendMultiplier
      const severity: 'info' | 'warning' | 'critical' =
        errorSeverity === 'critical' || latencySeverity === 'critical' ? 'critical'
        : errorSeverity === 'warning' || latencySeverity === 'warning' || trendDegraded ? 'warning'
        : 'info'

      await this.options.store.save({
        probeId: 'api',
        target,
        observedAt,
        status: statusFromSeverity(severity),
        latencyMs: p95Ms,
        errorRate: round(errorRate, 4),
        metricValue: failures,
        metricUnit: 'failed_requests',
        details: {
          sampleCount: samplesPerUrl,
          statusCodes: statuses,
          baselineP95Ms: baselineP95 == null ? null : Math.round(baselineP95),
          trendMultiplier: round(trendMultiplier),
        },
      })

      if (errorSeverity !== 'info') {
        incidents.push(makeIncident({
          context, kind: 'api-errors', target, observedAt, severity: errorSeverity,
          errorCode: 'native_api_error_rate',
          message: `API 5xx/network error rate is ${round(errorRate * 100, 1)}% across ${samplesPerUrl} live request(s).`,
          evidenceType: 'native_api_probe',
          evidenceSummary: `Statuses ${statuses.join(', ')}; p95 ${p95Ms} ms; ${failures}/${samplesPerUrl} request(s) failed or returned 5xx.`,
          metadata: { p95Ms, errorRate: round(errorRate, 4), sampleCount: samplesPerUrl, statusCodes: statuses },
        }))
      }

      if (latencySeverity !== 'info' || trendDegraded) {
        const finalSeverity: 'warning' | 'critical' = latencySeverity === 'critical' ? 'critical' : 'warning'
        incidents.push(makeIncident({
          context, kind: 'api-latency', target, observedAt, severity: finalSeverity,
          errorCode: trendDegraded ? 'native_api_latency_regression' : 'native_api_latency',
          message: trendDegraded && baselineP95 != null
            ? `API p95 latency is ${p95Ms} ms, ${round(p95Ms / baselineP95, 2)}x the recent native baseline.`
            : `API p95 latency is ${p95Ms} ms.`,
          evidenceType: 'native_api_latency_probe',
          evidenceSummary: `Measured ${samplesPerUrl} live request(s); recent baseline ${baselineP95 == null ? 'not yet established' : `${Math.round(baselineP95)} ms`}.`,
          metadata: { p95Ms, baselineP95Ms: baselineP95 == null ? null : Math.round(baselineP95), sampleCount: samplesPerUrl },
        }))
      }
    }
    return incidents
  }
}

export class DatabaseHealthObserver implements Observer {
  private readonly now: () => Date
  constructor(private readonly options: DatabaseProbeOptions) {
    this.now = options.now ?? (() => new Date())
  }

  async observe(context: ProviderObservationContext): Promise<SupervisorIncident[]> {
    const observedAt = this.now().toISOString()
    const target = this.options.target ?? 'supabase-postgres'
    const started = performance.now()
    const { data, error } = await this.options.db.rpc('self_healing_database_probe')
    const latencyMs = Math.round(performance.now() - started)
    const latencyThresholds = this.options.latencyMs ?? { warning: 750, critical: 2000 }
    const pressureThresholds = this.options.connectionPressurePct ?? { warning: 70, critical: 90 }

    if (error) {
      await this.options.store.save({
        probeId: 'database', target, observedAt, status: 'error', latencyMs, errorRate: 1,
        metricValue: null, metricUnit: 'connection_pressure_pct',
        details: { rpcOk: false, failure: String(error.message || 'database probe failed').slice(0, 220) },
      })
      return [makeIncident({
        context, kind: 'database', target, observedAt, severity: 'critical',
        errorCode: 'native_database_probe_failed',
        message: 'Native database health probe failed.',
        evidenceType: 'native_database_probe',
        evidenceSummary: `Read-only database health RPC failed after ${latencyMs} ms.`,
        metadata: { latencyMs, rpcOk: false },
      })]
    }

    const row = Array.isArray(data) ? data[0] : data
    const activeConnections = finite(row?.active_connections) ?? 0
    const maxConnections = Math.max(1, finite(row?.max_connections) ?? 1)
    const pressurePct = finite(row?.connection_pressure_pct) ?? round((activeConnections / maxConnections) * 100, 2)
    const activeQueries = finite(row?.active_queries) ?? 0
    const longestQuerySeconds = finite(row?.longest_query_seconds) ?? 0
    const latencySeverity = severityFor(latencyMs, latencyThresholds)
    const pressureSeverity = severityFor(pressurePct, pressureThresholds)
    const severity: 'info' | 'warning' | 'critical' =
      latencySeverity === 'critical' || pressureSeverity === 'critical' ? 'critical'
      : latencySeverity === 'warning' || pressureSeverity === 'warning' ? 'warning' : 'info'

    await this.options.store.save({
      probeId: 'database', target, observedAt, status: statusFromSeverity(severity), latencyMs, errorRate: 0,
      metricValue: round(pressurePct, 2), metricUnit: 'connection_pressure_pct',
      details: { activeConnections, maxConnections, activeQueries, longestQuerySeconds: round(longestQuerySeconds, 2) },
    })

    const incidents: SupervisorIncident[] = []
    if (pressureSeverity !== 'info') {
      incidents.push(makeIncident({
        context, kind: 'database-pressure', target, observedAt, severity: pressureSeverity,
        errorCode: 'native_database_connection_pressure',
        message: `Database connection pressure is ${round(pressurePct, 1)}% (${activeConnections}/${maxConnections}).`,
        evidenceType: 'native_database_probe',
        evidenceSummary: `${activeQueries} active query(s); longest active query ${round(longestQuerySeconds, 1)} seconds.`,
        metadata: { connectionPressurePct: round(pressurePct, 2), activeConnections, maxConnections, activeQueries, longestQuerySeconds: round(longestQuerySeconds, 2) },
      }))
    }
    if (latencySeverity !== 'info') {
      incidents.push(makeIncident({
        context, kind: 'database-latency', target, observedAt, severity: latencySeverity,
        errorCode: 'native_database_latency',
        message: `Database health RPC latency is ${latencyMs} ms.`,
        evidenceType: 'native_database_latency_probe',
        evidenceSummary: `Live read-only RPC completed in ${latencyMs} ms.`,
        metadata: { latencyMs, connectionPressurePct: round(pressurePct, 2) },
      }))
    }
    return incidents
  }
}

export class StorageHealthObserver implements Observer {
  private readonly now: () => Date
  constructor(private readonly options: StorageProbeOptions) {
    this.now = options.now ?? (() => new Date())
  }

  async observe(context: ProviderObservationContext): Promise<SupervisorIncident[]> {
    const observedAt = this.now().toISOString()
    const target = this.options.target ?? 'supabase-storage'
    const started = performance.now()
    const [bucketsResult, usageResult] = await Promise.all([
      this.options.db.storage.listBuckets(),
      this.options.db.rpc('self_healing_storage_probe', { quota_bytes: this.options.quotaBytes ?? null }),
    ])
    const latencyMs = Math.round(performance.now() - started)
    const failure = bucketsResult?.error || usageResult?.error
    const latencyThresholds = this.options.latencyMs ?? { warning: 1000, critical: 3000 }
    const capacityThresholds = this.options.capacityPct ?? { warning: 80, critical: 95 }

    if (failure) {
      await this.options.store.save({
        probeId: 'storage', target, observedAt, status: 'error', latencyMs, errorRate: 1,
        metricValue: null, metricUnit: 'capacity_pct',
        details: { apiOk: !bucketsResult?.error, rpcOk: !usageResult?.error, failure: String(failure.message || 'storage probe failed').slice(0, 220) },
      })
      return [makeIncident({
        context, kind: 'storage', target, observedAt, severity: 'critical',
        errorCode: 'native_storage_probe_failed',
        message: 'Native storage health probe failed.',
        evidenceType: 'native_storage_probe',
        evidenceSummary: `Storage API/usage checks failed after ${latencyMs} ms.`,
        metadata: { latencyMs, storageApiOk: !bucketsResult?.error, usageRpcOk: !usageResult?.error },
      })]
    }

    const row = Array.isArray(usageResult?.data) ? usageResult.data[0] : usageResult?.data
    const bytesUsed = finite(row?.bytes_used) ?? 0
    const objectCount = finite(row?.object_count) ?? 0
    const bucketCount = finite(row?.bucket_count) ?? (Array.isArray(bucketsResult?.data) ? bucketsResult.data.length : 0)
    const capacityPct = finite(row?.capacity_pct)
    const latencySeverity = severityFor(latencyMs, latencyThresholds)
    const capacitySeverity = capacityPct == null ? 'info' : severityFor(capacityPct, capacityThresholds)
    const severity: 'info' | 'warning' | 'critical' =
      latencySeverity === 'critical' || capacitySeverity === 'critical' ? 'critical'
      : latencySeverity === 'warning' || capacitySeverity === 'warning' ? 'warning' : 'info'

    await this.options.store.save({
      probeId: 'storage', target, observedAt, status: statusFromSeverity(severity), latencyMs, errorRate: 0,
      metricValue: capacityPct ?? bytesUsed, metricUnit: capacityPct == null ? 'bytes_used' : 'capacity_pct',
      details: { bytesUsed, objectCount, bucketCount, capacityPct: capacityPct == null ? null : round(capacityPct, 2), quotaConfigured: capacityPct != null },
    })

    const incidents: SupervisorIncident[] = []
    if (capacitySeverity !== 'info' && capacityPct != null) {
      incidents.push(makeIncident({
        context, kind: 'storage-capacity', target, observedAt, severity: capacitySeverity,
        errorCode: 'native_storage_capacity_pressure',
        message: `Storage capacity is ${round(capacityPct, 1)}% used.`,
        evidenceType: 'native_storage_capacity_probe',
        evidenceSummary: `${bytesUsed} byte(s) across ${objectCount} object(s) in ${bucketCount} bucket(s).`,
        metadata: { capacityPct: round(capacityPct, 2), bytesUsed, objectCount, bucketCount },
      }))
    }
    if (latencySeverity !== 'info') {
      incidents.push(makeIncident({
        context, kind: 'storage-latency', target, observedAt, severity: latencySeverity,
        errorCode: 'native_storage_latency',
        message: `Storage health probe latency is ${latencyMs} ms.`,
        evidenceType: 'native_storage_latency_probe',
        evidenceSummary: `Live bucket listing and storage usage RPC completed in ${latencyMs} ms.`,
        metadata: { latencyMs, bytesUsed, objectCount, bucketCount },
      }))
    }
    return incidents
  }
}

async function inspectTlsCertificate(target: CertificateTarget, timeoutMs: number): Promise<{ validTo: string; subject?: string; issuer?: string }> {
  return new Promise((resolve, reject) => {
    const socket = tlsConnect({
      host: target.host,
      port: target.port ?? 443,
      servername: target.host,
      rejectUnauthorized: true,
    })
    const timer = setTimeout(() => {
      socket.destroy()
      reject(new Error('tls_probe_timeout'))
    }, timeoutMs)

    socket.once('secureConnect', () => {
      clearTimeout(timer)
      try {
        const certificate = socket.getPeerCertificate()
        if (!certificate || !certificate.valid_to) throw new Error('tls_certificate_missing')
        resolve({
          validTo: certificate.valid_to,
          subject: certificate.subject?.CN,
          issuer: certificate.issuer?.CN,
        })
      } catch (error) {
        reject(error)
      } finally {
        socket.end()
      }
    })
    socket.once('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
  })
}

export class CertificateExpiryObserver implements Observer {
  private readonly now: () => Date
  private readonly inspect: NonNullable<CertificateProbeOptions['inspectCertificate']>

  constructor(private readonly options: CertificateProbeOptions) {
    this.now = options.now ?? (() => new Date())
    this.inspect = options.inspectCertificate ?? inspectTlsCertificate
  }

  async observe(context: ProviderObservationContext): Promise<SupervisorIncident[]> {
    const incidents: SupervisorIncident[] = []
    const thresholds = this.options.expiryDays ?? { warning: 30, critical: 7 }
    const timeoutMs = clamp(Math.round(this.options.timeoutMs ?? 8000), 1000, 30000)

    for (const targetInfo of this.options.targets) {
      const observedAt = this.now().toISOString()
      const target = `${targetInfo.host}:${targetInfo.port ?? 443}`
      const started = performance.now()
      try {
        const certificate = await this.inspect(targetInfo, timeoutMs)
        const latencyMs = Math.round(performance.now() - started)
        const expiryMs = Date.parse(certificate.validTo)
        if (!Number.isFinite(expiryMs)) throw new Error('tls_certificate_expiry_invalid')
        const daysRemaining = (expiryMs - Date.parse(observedAt)) / 86_400_000
        const severity = lowerIsWorse(daysRemaining, thresholds)

        await this.options.store.save({
          probeId: 'certificate', target, observedAt, status: statusFromSeverity(severity), latencyMs, errorRate: 0,
          metricValue: round(daysRemaining, 2), metricUnit: 'days_remaining',
          details: { validTo: new Date(expiryMs).toISOString(), subject: certificate.subject ?? null, issuer: certificate.issuer ?? null },
        })

        if (severity !== 'info') {
          incidents.push(makeIncident({
            context, kind: 'certificate-expiry', target, observedAt, severity,
            errorCode: 'native_certificate_expiry',
            message: `TLS certificate for ${targetInfo.host} expires in ${round(daysRemaining, 1)} day(s).`,
            evidenceType: 'native_tls_certificate_probe',
            evidenceSummary: `Validated TLS handshake; certificate expires ${new Date(expiryMs).toISOString()}.`,
            metadata: { daysRemaining: round(daysRemaining, 2), validTo: new Date(expiryMs).toISOString(), tlsHandshakeMs: latencyMs },
          }))
        }
      } catch (error) {
        const latencyMs = Math.round(performance.now() - started)
        await this.options.store.save({
          probeId: 'certificate', target, observedAt, status: 'error', latencyMs, errorRate: 1,
          metricValue: null, metricUnit: 'days_remaining',
          details: { tlsOk: false, failure: String(error instanceof Error ? error.message : 'TLS probe failed').slice(0, 220) },
        })
        incidents.push(makeIncident({
          context, kind: 'certificate', target, observedAt, severity: 'critical',
          errorCode: 'native_tls_validation_failed',
          message: `TLS validation failed for ${targetInfo.host}.`,
          evidenceType: 'native_tls_certificate_probe',
          evidenceSummary: `A real TLS handshake failed after ${latencyMs} ms.`,
          metadata: { tlsOk: false, tlsHandshakeMs: latencyMs },
        }))
      }
    }
    return incidents
  }
}

export function createNativeProactiveMonitoringCollectors(input: {
  db: any
  store: NativeProbeStore
  apiUrls: readonly string[]
  certificateTargets: readonly CertificateTarget[]
  storageQuotaBytes?: number | null
}): NativeMonitoringCollector[] {
  return [
    {
      id: 'native-api-health',
      signals: ['api-error-rate', 'api-latency'],
      observer: new ApiHealthObserver({ urls: input.apiUrls, store: input.store }),
    },
    {
      id: 'native-database-health',
      signals: ['database-health'],
      observer: new DatabaseHealthObserver({ db: input.db, store: input.store }),
    },
    {
      id: 'native-storage-health',
      signals: ['storage-health'],
      observer: new StorageHealthObserver({ db: input.db, store: input.store, quotaBytes: input.storageQuotaBytes }),
    },
    {
      id: 'native-certificate-expiry',
      signals: ['certificate-expiry'],
      observer: new CertificateExpiryObserver({ targets: input.certificateTargets, store: input.store }),
    },
  ]
}
