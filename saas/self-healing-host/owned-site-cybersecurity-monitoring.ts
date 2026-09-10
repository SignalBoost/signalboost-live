import type { Observer, ProviderObservationContext } from '@/lib/supervisor/execution-contracts'
import { incidentSchema, type SupervisorIncident } from '@/lib/supervisor/incident-schema'
import { PUBLIC_BRAND } from '@/lib/public-brand'
import type { NativeMonitoringCollector } from './native-monitoring-runtime.ts'
import { isCanonicalOwnedSite } from './owned-site-optimization-monitoring.ts'

const OWNED_SITE_PROBE = 'owned-site-cybersecurity'
const OWNED_SITE_FINDINGS = 'owned_site_cybersecurity_findings'
const OWNED_SITE_PROBE_FAILED = 'owned_site_cybersecurity_probe_failed'

type CyberFinding = {
  code?: unknown
  category?: unknown
  severity?: unknown
  value?: unknown
}

type CyberReport = {
  ok?: unknown
  error?: unknown
  finalUrl?: unknown
  target?: unknown
  summary?: {
    score?: unknown
    findings?: unknown
    high?: unknown
    medium?: unknown
    low?: unknown
  }
  findings?: CyberFinding[]
}

type ReportScalar = string | number | boolean

export const OWNED_SITE_CYBERSECURITY_PROBE = OWNED_SITE_PROBE
export const OWNED_SITE_CYBERSECURITY_FINDINGS_ERROR = OWNED_SITE_FINDINGS
export const OWNED_SITE_CYBERSECURITY_PROBE_FAILED_ERROR = OWNED_SITE_PROBE_FAILED

function boundedNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function scalar(value: unknown): ReportScalar | undefined {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? value : undefined
}

function safeFindings(value: unknown): Array<Record<string, ReportScalar>> {
  if (!Array.isArray(value)) return []
  return value.slice(0, 12).flatMap((item): Array<Record<string, ReportScalar>> => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return []
    const row = item as CyberFinding
    const code = text(row.code).slice(0, 120)
    if (!code) return []
    const serializable = scalar(row.value)
    return [{
      code,
      category: text(row.category, 'unknown').slice(0, 80),
      severity: text(row.severity, 'low').slice(0, 40),
      ...(serializable !== undefined ? { value: serializable } : {}),
    }]
  })
}

function bucketId(at: string): number {
  return Math.floor(Date.parse(at) / (30 * 60 * 1000))
}

function makeIncident(input: {
  context: ProviderObservationContext
  at: string
  code: string
  severity: 'warning' | 'critical'
  message: string
  summary: string
  report: Record<string, string | number | boolean | null | Array<Record<string, string | number | boolean | null>>>
}): SupervisorIncident {
  const target = new URL(PUBLIC_BRAND.siteUrl).toString()
  const incidentId = `owned-site-cybersecurity-${bucketId(input.at)}`
  return incidentSchema.parse({
    incidentId,
    provider: input.context.provider || 'signalboost-platform',
    environment: input.context.environment || 'production',
    severity: input.severity,
    detectedAt: input.at,
    source: 'cron',
    errorCode: input.code,
    errorMessage: input.message,
    affectedResource: target,
    evidence: [{
      evidenceId: `${incidentId}:cybersecurity-preview`,
      type: 'owned_site_cybersecurity_report',
      capturedAt: input.at,
      summary: input.summary.slice(0, 1000),
      reference: target,
    }],
    metadata: {
      monitoringMode: 'native',
      observationOnly: true,
      nativeProbe: OWNED_SITE_PROBE,
      recoveryPreauthorized: true,
      ownedPlatform: true,
      report: input.report,
    },
  })
}

export function ownedSiteCybersecurityMonitoringCollector(options: {
  apiBaseUrl: string
  fetchImpl?: typeof fetch
  now?: () => Date
}): NativeMonitoringCollector {
  const request = options.fetchImpl ?? fetch
  const now = options.now ?? (() => new Date())
  const apiBaseUrl = String(options.apiBaseUrl || '').replace(/\/+$/, '')

  const observer: Observer = {
    async observe(context: ProviderObservationContext): Promise<SupervisorIncident[]> {
      const at = now().toISOString()
      if (!apiBaseUrl) throw new Error('owned_site_cybersecurity_api_base_missing')
      let response: Response
      let payload: CyberReport | null = null
      try {
        response = await request(`${apiBaseUrl}/api/public/cybersecurity-preview`, {
          method: 'POST',
          cache: 'no-store',
          headers: {
            'content-type': 'application/json',
            'user-agent': 'iTMounts-Self-Healing-Cybersecurity-Preview/1.0',
          },
          body: JSON.stringify({ url: PUBLIC_BRAND.siteUrl }),
          signal: AbortSignal.timeout(15_000),
        })
        payload = await response.json().catch(() => null) as CyberReport | null
      } catch (error) {
        return [makeIncident({
          context,
          at,
          code: OWNED_SITE_PROBE_FAILED,
          severity: 'critical',
          message: 'The owned-site Cybersecurity Preview could not complete.',
          summary: error instanceof Error ? error.message : 'Cybersecurity Preview request failed.',
          report: { ok: false, httpStatus: 0, error: error instanceof Error ? error.message.slice(0, 220) : 'request_failed' },
        })]
      }

      if (!response.ok || payload?.ok !== true) {
        const error = text(payload?.error, `HTTP ${response.status}`).slice(0, 220)
        return [makeIncident({
          context,
          at,
          code: OWNED_SITE_PROBE_FAILED,
          severity: 'critical',
          message: `The owned-site Cybersecurity Preview returned an unsuccessful result (${response.status}).`,
          summary: error,
          report: { ok: false, httpStatus: response.status, error },
        })]
      }

      const finalUrl = text(payload.finalUrl || payload.target, PUBLIC_BRAND.siteUrl)
      if (!isCanonicalOwnedSite(finalUrl)) {
        return [makeIncident({
          context,
          at,
          code: OWNED_SITE_PROBE_FAILED,
          severity: 'critical',
          message: 'The owned-site Cybersecurity Preview resolved outside the canonical iTMounts host.',
          summary: `Unexpected final host: ${finalUrl}`,
          report: { ok: false, httpStatus: response.status, error: 'unexpected_final_host' },
        })]
      }

      const findings = safeFindings(payload.findings)
      if (!findings.length) return []
      const score = boundedNumber(payload.summary?.score)
      const high = boundedNumber(payload.summary?.high)
      const medium = boundedNumber(payload.summary?.medium)
      const low = boundedNumber(payload.summary?.low)
      const findingCodes = findings.map(finding => String(finding.code))
      return [makeIncident({
        context,
        at,
        code: OWNED_SITE_FINDINGS,
        severity: high > 0 ? 'critical' : 'warning',
        message: `The owned iTMounts site has ${findings.length} Cybersecurity Preview finding(s) requiring remediation.`,
        summary: `Score ${score}; high ${high}; medium ${medium}; low ${low}; findings: ${findingCodes.join(', ')}.`,
        report: {
          ok: true,
          httpStatus: response.status,
          score,
          high,
          medium,
          low,
          findingCodes: findingCodes.join(','),
          findings,
        },
      })]
    },
  }

  return {
    id: OWNED_SITE_PROBE,
    signals: ['service-health', 'configuration-drift'],
    observer,
  }
}
