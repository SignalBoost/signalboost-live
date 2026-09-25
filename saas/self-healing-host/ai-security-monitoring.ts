import type { Observer, ProviderObservationContext } from '@/lib/supervisor/execution-contracts'
import { incidentSchema, type SupervisorIncident } from '@/lib/supervisor/incident-schema'
import type { NativeMonitoringCollector } from './native-monitoring-runtime'

export const AI_SECURITY_NATIVE_PROBE = 'ai-security-observation' as const

function safeArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map(item => String(item).slice(0, 100)).filter(Boolean).slice(0, 12)
    : []
}

function hash(value: string): string {
  let h = 0
  for (const char of value) h = ((h << 5) - h + char.charCodeAt(0)) | 0
  return Math.abs(h).toString(36)
}

export function aiSecurityMonitoringCollector(options: {
  db: any
  now?: () => Date
  lookbackMs?: number
  limit?: number
}): NativeMonitoringCollector {
  const now = options.now ?? (() => new Date())
  const lookbackMs = Math.max(60_000, Math.min(options.lookbackMs ?? 60 * 60_000, 6 * 60 * 60_000))
  const limit = Math.max(1, Math.min(options.limit ?? 16, 50))

  const observer: Observer = {
    async observe(context: ProviderObservationContext): Promise<SupervisorIncident[]> {
      const at = now()
      const since = new Date(at.getTime() - lookbackMs).toISOString()
      const [observations, supervised] = await Promise.all([
        options.db.from('supervisor_audit_events')
          .select('event_id,incident_id,event_type,occurred_at,payload')
          .eq('event_type', 'ai_security_observation_recorded')
          .gte('occurred_at', since)
          .order('occurred_at', { ascending: false })
          .limit(limit),
        options.db.from('supervisor_audit_events')
          .select('payload')
          .eq('event_type', 'ai_security_observation_supervised')
          .gte('occurred_at', new Date(at.getTime() - 6 * 60 * 60_000).toISOString())
          .limit(200),
      ])
      if (observations.error) throw new Error('ai_security_observation_read_failed')
      if (supervised.error) throw new Error('ai_security_supervision_read_failed')

      const handled = new Set((supervised.data ?? [])
        .map((row: any) => String(row?.payload?.observationEventId || ''))
        .filter(Boolean))

      return (observations.data ?? [])
        .filter((row: any) => !handled.has(String(row.event_id || '')))
        .slice(0, 8)
        .map((row: any): SupervisorIncident => {
          const payload = row.payload && typeof row.payload === 'object' ? row.payload : {}
          const eventId = String(row.event_id || '')
          const codes = safeArray(payload.findingCodes)
          const severity = String(payload.severity) === 'critical' ? 'critical' : 'warning'
          const source = String(payload.source || 'unknown').slice(0, 80)
          const surface = String(payload.surface || 'unknown').slice(0, 80)
          const detectedAt = String(row.occurred_at || at.toISOString())
          const incidentId = `ai-security-${hash(eventId)}`
          return incidentSchema.parse({
            incidentId,
            provider: context.provider || 'signalboost-platform',
            environment: context.environment || 'production',
            severity,
            detectedAt,
            source: 'cron',
            errorCode: 'ai_security_observation',
            errorMessage: `AI security control observed ${codes.length} finding class(es) on ${surface}.`,
            affectedResource: `ai-security://${surface}`,
            evidence: [{
              evidenceId: `${incidentId}:observation`,
              type: 'ai_security_observation',
              capturedAt: detectedAt,
              summary: `Source ${source}; disposition ${String(payload.disposition || 'sanitized').slice(0,40)}; finding codes: ${codes.join(', ') || 'unspecified'}.`,
              reference: eventId,
            }],
            metadata: {
              monitoringMode: 'native',
              observationOnly: true,
              nativeProbe: AI_SECURITY_NATIVE_PROBE,
              observationEventId: eventId,
              securitySource: source,
              securitySurface: surface,
              findingCodes: codes,
              rawContentPersisted: false,
              automaticRepairAuthorized: false,
              recoveryPreauthorized: false,
            },
          })
        })
    },
  }

  return {
    id: AI_SECURITY_NATIVE_PROBE,
    signals: ['security-observation'],
    observer,
  }
}
