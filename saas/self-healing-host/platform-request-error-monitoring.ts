// saas/self-healing-host/platform-request-error-monitoring.ts
//
// Platform request errors (recorded by instrumentation.ts onRequestError into supervisor_audit_events) become
// Self-Healing Supervisor incidents, one per failing route + error, so the Supervisor diagnoses and repairs them
// through its existing owned-platform path. Each recorded error raises at most one incident: the cron marks the
// events it supervised (PLATFORM_REQUEST_ERROR_SUPERVISED_EVENT) and later cycles skip them.

import type { Observer, ProviderObservationContext } from '../lib/supervisor/execution-contracts.ts'
import { incidentSchema, type SupervisorIncident } from '../lib/supervisor/incident-schema.ts'
import { PLATFORM_REQUEST_ERROR_EVENT } from '../lib/observability/requestErrors.ts'
import type { NativeMonitoringCollector } from './native-monitoring-runtime.ts'

export const PLATFORM_REQUEST_ERROR_PROBE = 'platform-request-error' as const
export const PLATFORM_REQUEST_ERROR_CODE = 'platform_request_error' as const
export const PLATFORM_REQUEST_ERROR_SUPERVISED_EVENT = 'platform_request_error_supervised' as const

const LOOKBACK_MS = 60 * 60_000
const SUPERVISED_LOOKBACK_MS = 6 * 60 * 60_000
const MAX_INCIDENTS_PER_CYCLE = 3

type ErrorRow = { event_id?: unknown; occurred_at?: unknown; payload?: unknown }

function text(value: unknown, max: number): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function hash(value: string): string {
  let h = 0
  for (const char of value) h = ((h << 5) - h + char.charCodeAt(0)) | 0
  return Math.abs(h).toString(36)
}

/** The remediation scope of a failing route: the same route + error is one repair, whatever the deployment. */
export function platformRequestErrorScope(routePath: string, errorCode: string): string {
  return `${text(routePath, 200)}|${text(errorCode, 80)}`
}

export function platformRequestErrorMonitoringCollector(options: {
  db: any
  now?: () => Date
}): NativeMonitoringCollector {
  const now = options.now ?? (() => new Date())
  const observer: Observer = {
    async observe(context: ProviderObservationContext): Promise<SupervisorIncident[]> {
      const at = now()
      const [errors, supervised] = await Promise.all([
        options.db.from('supervisor_audit_events')
          .select('event_id,occurred_at,payload')
          .eq('event_type', PLATFORM_REQUEST_ERROR_EVENT)
          .gte('occurred_at', new Date(at.getTime() - LOOKBACK_MS).toISOString())
          .order('occurred_at', { ascending: false })
          .limit(200),
        options.db.from('supervisor_audit_events')
          .select('payload')
          .eq('event_type', PLATFORM_REQUEST_ERROR_SUPERVISED_EVENT)
          .gte('occurred_at', new Date(at.getTime() - SUPERVISED_LOOKBACK_MS).toISOString())
          .limit(500),
      ])
      if (errors.error) throw new Error('platform_request_error_read_failed')
      if (supervised.error) throw new Error('platform_request_error_supervision_read_failed')

      const handled = new Set<string>((supervised.data ?? []).flatMap((row: any) =>
        Array.isArray(row?.payload?.observationEventIds) ? row.payload.observationEventIds.map(String) : []))
      const groups = new Map<string, ErrorRow[]>()
      for (const row of (errors.data ?? []) as ErrorRow[]) {
        const eventId = text(row.event_id, 400)
        const payload = row.payload && typeof row.payload === 'object' ? row.payload as Record<string, unknown> : {}
        if (!eventId || handled.has(eventId)) continue
        const scope = platformRequestErrorScope(text(payload.routePath || payload.path, 200), text(payload.errorCode, 80))
        groups.set(scope, [...(groups.get(scope) ?? []), row])
      }

      return [...groups.entries()]
        .sort((a, b) => b[1].length - a[1].length)
        .slice(0, MAX_INCIDENTS_PER_CYCLE)
        .map(([scope, rows]): SupervisorIncident => {
          const latest = rows[0]
          const payload = (latest.payload ?? {}) as Record<string, unknown>
          const routePath = text(payload.routePath || payload.path, 200)
          const errorCode = text(payload.errorCode, 80)
          const errorMessage = text(payload.errorMessage, 600)
          const eventIds = rows.map(row => text(row.event_id, 400))
          const traceIds = [...new Set(rows.map(row => text((row.payload as any)?.traceId, 64)).filter(Boolean))].slice(0, 5)
          const lastSeen = text(latest.occurred_at, 40) || at.toISOString()
          const firstSeen = text(rows[rows.length - 1].occurred_at, 40) || lastSeen
          const incidentId = `platform-request-error-${hash(scope)}-${hash(eventIds[0])}`
          return incidentSchema.parse({
            incidentId,
            provider: context.provider || 'signalboost-platform',
            environment: context.environment || 'production',
            severity: rows.length >= 5 ? 'critical' : 'warning',
            detectedAt: lastSeen,
            source: 'cron',
            errorCode: PLATFORM_REQUEST_ERROR_CODE,
            errorMessage: `${text(payload.method, 10) || 'Request'} ${text(payload.path, 200) || routePath} (route ${routePath}) failed ${rows.length} time(s) in the last hour: ${errorCode}: ${errorMessage}`.slice(0, 900),
            affectedResource: `route://${routePath}`,
            evidence: rows.slice(0, 5).map((row, index) => ({
              evidenceId: `${incidentId}:error:${index}`,
              type: 'platform_request_error',
              capturedAt: text(row.occurred_at, 40) || lastSeen,
              summary: `${text((row.payload as any)?.method, 10)} ${text((row.payload as any)?.path, 200)} (${text((row.payload as any)?.routeType, 20) || 'route'}); trace ${text((row.payload as any)?.traceId, 64) || 'none'}; ${errorCode}: ${errorMessage}`.slice(0, 900),
              reference: text(row.event_id, 400),
            })),
            metadata: {
              monitoringMode: 'native',
              nativeProbe: PLATFORM_REQUEST_ERROR_PROBE,
              ownedPlatform: true,
              recoveryPreauthorized: true,
              routePath,
              routeType: text(payload.routeType, 20) || null,
              requestErrorCode: errorCode,
              requestErrorMessage: errorMessage,
              occurrences: rows.length,
              firstSeen,
              lastSeen,
              traceIds,
              observationEventIds: eventIds,
            },
          })
        })
    },
  }
  return { id: PLATFORM_REQUEST_ERROR_PROBE, signals: ['api-error-rate'], observer }
}
