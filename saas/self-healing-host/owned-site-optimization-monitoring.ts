import type { Observer, ProviderObservationContext } from '../lib/supervisor/execution-contracts.ts'
import { incidentSchema, type SupervisorIncident } from '../lib/supervisor/incident-schema.ts'
import { PUBLIC_BRAND } from '../lib/public-brand.ts'
import type { NativeMonitoringCollector } from './native-monitoring-runtime.ts'

const OWNED_SITE_PROBE = 'owned-site-optimization'
const OWNED_SITE_FINDINGS = 'owned_site_optimization_findings'
const OWNED_SITE_PROBE_FAILED = 'owned_site_optimizer_probe_failed'

type OptimizationFinding = {
  code?: unknown
  category?: unknown
  severity?: unknown
  value?: unknown
}

type OptimizationReport = {
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
  findings?: OptimizationFinding[]
}

type ReportScalar = string | number | boolean

export const OWNED_SITE_OPTIMIZATION_PROBE = OWNED_SITE_PROBE

/**
 * Findings a bounded repository change can fix (response headers, document metadata, markup). Workload and latency
 * measurements (many_scripts, many_stylesheets, large_html, slow/moderate_response) and the CTA content check stay in
 * the report but do not become repair incidents. Production 2026-10-22: many_scripts alone (a Next.js App Router page
 * carries many framework <script> elements) was queued as a repair 11 times in 3 hours; every attempt ran about 20
 * minutes and ended in builder_turn_timeout.
 */
export const REPAIRABLE_OPTIMIZATION_FINDINGS: ReadonlySet<string> = new Set([
  'missing_csp', 'missing_hsts', 'missing_nosniff', 'not_https',
  'missing_compression', 'missing_cache_header',
  'missing_title', 'title_length', 'missing_description', 'description_length', 'missing_viewport',
  'missing_canonical', 'h1_count', 'robots_noindex', 'missing_social_meta',
  'images_missing_alt', 'missing_html_lang', 'missing_lazy_images',
])
export const OWNED_SITE_OPTIMIZATION_FINDINGS_ERROR = OWNED_SITE_FINDINGS
export const OWNED_SITE_OPTIMIZATION_PROBE_FAILED_ERROR = OWNED_SITE_PROBE_FAILED

function ownedTarget(): URL {
  return new URL(PUBLIC_BRAND.siteUrl)
}

export function isCanonicalOwnedSite(value: string): boolean {
  try {
    const candidate = new URL(value)
    const canonical = ownedTarget()
    return candidate.protocol === 'https:'
      && candidate.hostname.toLowerCase() === canonical.hostname.toLowerCase()
      && (candidate.port || '443') === (canonical.port || '443')
  } catch {
    return false
  }
}

function boundedNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function reportScalar(value: unknown): ReportScalar | undefined {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
    ? value
    : undefined
}

function safeFindings(value: unknown): Array<Record<string, ReportScalar>> {
  if (!Array.isArray(value)) return []
  return value.slice(0, 12).flatMap((item): Array<Record<string, ReportScalar>> => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return []
    const row = item as OptimizationFinding
    const code = text(row.code).slice(0, 120)
    if (!code) return []
    const serializableValue = reportScalar(row.value)
    return [{
      code,
      category: text(row.category, 'unknown').slice(0, 80),
      severity: text(row.severity, 'low').slice(0, 40),
      ...(serializableValue !== undefined ? { value: serializableValue } : {}),
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
  const target = ownedTarget().toString()
  const incidentId = `owned-site-optimization-${bucketId(input.at)}`
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
      evidenceId: `${incidentId}:website-optimizer`,
      type: 'owned_site_optimization_report',
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

export function ownedSiteOptimizationMonitoringCollector(options: {
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
      if (!apiBaseUrl) throw new Error('owned_site_optimizer_api_base_missing')
      let response: Response
      let payload: OptimizationReport | null = null
      try {
        response = await request(`${apiBaseUrl}/api/public/site-optimization`, {
          method: 'POST',
          cache: 'no-store',
          headers: {
            'content-type': 'application/json',
            'user-agent': 'SignalBoost-Self-Healing-Website-Optimizer/1.0',
          },
          body: JSON.stringify({ url: PUBLIC_BRAND.siteUrl }),
          signal: AbortSignal.timeout(15_000),
        })
        payload = await response.json().catch(() => null) as OptimizationReport | null
      } catch (error) {
        return [makeIncident({
          context,
          at,
          code: OWNED_SITE_PROBE_FAILED,
          severity: 'critical',
          message: 'The owned-site Website Optimizer probe could not complete.',
          summary: error instanceof Error ? error.message : 'Website Optimizer request failed.',
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
          message: `The owned-site Website Optimizer returned an unsuccessful result (${response.status}).`,
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
          message: 'The owned-site Website Optimizer resolved outside the canonical iTMounts host.',
          summary: `Unexpected final host: ${finalUrl}`,
          report: { ok: false, httpStatus: response.status, error: 'unexpected_final_host' },
        })]
      }

      const reported = safeFindings(payload.findings)
      const findings = reported.filter(finding => REPAIRABLE_OPTIMIZATION_FINDINGS.has(String(finding.code)))
      const advisoryCodes = reported.filter(finding => !REPAIRABLE_OPTIMIZATION_FINDINGS.has(String(finding.code))).map(finding => String(finding.code))
      if (!findings.length) return []
      const score = boundedNumber(payload.summary?.score)
      const high = findings.filter(finding => finding.severity === 'high').length
      const medium = findings.filter(finding => finding.severity === 'medium').length
      const low = findings.filter(finding => finding.severity === 'low').length
      const findingCodes = findings.map(finding => String(finding.code))
      return [makeIncident({
        context,
        at,
        code: OWNED_SITE_FINDINGS,
        severity: high > 0 ? 'critical' : 'warning',
        message: `The owned iTMounts site has ${findings.length} Website Optimizer finding(s) requiring remediation.`,
        summary: `Score ${score}; repairable high ${high}; medium ${medium}; low ${low}; findings: ${findingCodes.join(', ')}${advisoryCodes.length ? `; advisory (not repaired): ${advisoryCodes.join(', ')}` : ''}.`,
        report: {
          ok: true,
          httpStatus: response.status,
          score,
          high,
          medium,
          low,
          findingCodes: findingCodes.join(','),
          advisoryCodes: advisoryCodes.join(','),
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
