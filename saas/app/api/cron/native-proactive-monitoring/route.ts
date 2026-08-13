import { NextRequest, NextResponse } from 'next/server'
import { getAdminSupabase } from '@/utils/supabase/server'
import { runNativeMonitoring } from '@/self-healing-host/native-monitoring-runtime'
import { remediateNativeIncidents } from '@/self-healing-host/native-autonomous-loop'
import { collectAssessmentConfidenceIncident } from '@/self-healing-host/assessment-confidence-monitoring'
import { persistenceNativeMonitoringCollector } from '@/self-healing-host/native-persistence-monitoring'
import { SupabaseNativeProbeStore, createNativeProactiveMonitoringCollectors, type CertificateTarget } from '@/self-healing-host/native-proactive-monitoring'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const boundedNumber = (name: string, fallback: number, min: number, max: number): number => {
  const parsed = Number(process.env[name] ?? fallback)
  return Number.isFinite(parsed) ? Math.min(Math.max(parsed, min), max) : fallback
}
function authorized(req: NextRequest): boolean { const secret = process.env.CRON_SECRET; return Boolean(secret && req.headers.get('authorization') === `Bearer ${secret}`) }
function productionBaseUrl(): string { const configured = String(process.env.NEXT_PUBLIC_APP_URL || '').trim(); if (configured) return configured.replace(/\/+$/, ''); const v = String(process.env.VERCEL_PROJECT_PRODUCTION_URL || '').trim(); if (v) return `https://${v.replace(/^https?:\/\//, '').replace(/\/+$/, '')}`; return 'https://saas.signalboostapp.com' }
function apiTargetCap(): number { return Math.round(boundedNumber('SELF_HEALING_API_PROBE_TARGET_CAP', 8, 1, 8)) }
function parseApiUrls(): string[] {
  const configured = String(process.env.SELF_HEALING_API_PROBE_URLS || '').split(',').map(v => v.trim()).filter(Boolean)
  const urls = configured.length ? configured : [`${productionBaseUrl()}/api/supervisor/native-health`]
  return [...new Set(urls)].filter(value => { try { const u = new URL(value); return u.protocol === 'https:' || (process.env.NODE_ENV !== 'production' && u.protocol === 'http:') } catch { return false } }).slice(0, apiTargetCap())
}
function parseTlsTargets(apiUrls: readonly string[]): CertificateTarget[] {
  const configured: CertificateTarget[] = String(process.env.SELF_HEALING_TLS_TARGETS || '').split(',').map(v => v.trim()).filter(Boolean).flatMap(value => { const [host, portText] = value.split(':'); const port = Number(portText || 443); return host && Number.isInteger(port) && port > 0 && port <= 65535 ? [{ host, port }] : [] })
  const fromApi: CertificateTarget[] = apiUrls.flatMap(value => { try { const u = new URL(value); return u.protocol === 'https:' ? [{ host: u.hostname, port: u.port ? Number(u.port) : 443 }] : [] } catch { return [] } })
  const unique = new Map<string, CertificateTarget>(); for (const target of [...configured, ...fromApi]) unique.set(`${target.host}:${target.port ?? 443}`, target); return [...unique.values()].slice(0, 8)
}
function storageQuotaBytes(): number | null { const raw = String(process.env.SELF_HEALING_STORAGE_QUOTA_BYTES || '').trim(); if (!raw) return null; const n = Number(raw); return Number.isFinite(n) && n > 0 ? n : null }

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  const db = getAdminSupabase(); const store = new SupabaseNativeProbeStore(db)
  try { await store.verifySchema() } catch (error) { return NextResponse.json({ ok: false, error: 'native_probe_store_unavailable', detail: error instanceof Error ? error.message.slice(0,220) : 'native probe schema unavailable' }, { status: 503 }) }
  const apiUrls = parseApiUrls(); const certificateTargets = parseTlsTargets(apiUrls)
  if (!apiUrls.length || !certificateTargets.length) return NextResponse.json({ ok: false, error: 'native_probe_targets_unavailable' }, { status: 503 })
  const quotaBytes = storageQuotaBytes()
  const collectors = [
    ...createNativeProactiveMonitoringCollectors({ db, store, apiUrls, certificateTargets, storageQuotaBytes: quotaBytes }),
    persistenceNativeMonitoringCollector({ db }),
  ]
  const result = await runNativeMonitoring({ context: { provider: 'signalboost-platform', environment: 'production', metadata: { source: 'native-proactive-monitoring-cron', readOnly: true, providerMutations: false } }, collectors, nativeEnabled: process.env.SELF_HEALING_NATIVE_MONITORING_ENABLED !== 'false', externalConnected: process.env.SELF_HEALING_EXTERNAL_MONITORING_CONNECTED === 'true' })

  // Evidence-quality deficits are preventive conditions too. A durable claim suppresses repeated
  // COS work for the same fingerprint while allowing changed evidence to be investigated now.
  const confidenceIncident = await collectAssessmentConfidenceIncident(db).catch(() => null)
  const incidents = confidenceIncident ? [...result.incidents, confidenceIncident] : result.incidents
  const remediation = incidents.length ? await remediateNativeIncidents(incidents, { maxIncidents: 4 }) : []
  const status = result.collectorErrors.length === collectors.length ? 503 : 200
  return NextResponse.json({
    ok: status === 200,
    schemaVersion: 'self-healing-native-proactive-monitoring-v3',
    runAt: new Date().toISOString(),
    readOnly: result.readOnly,
    providerMutations: result.providerMutations,
    mode: result.mode,
    limits: { apiTargets: apiUrls.length, tlsTargets: certificateTargets.length, maxDurationSeconds: maxDuration, storageQuotaConfigured: quotaBytes != null, apiTargetCap: apiTargetCap() },
    collectorsRun: result.collectorsRun,
    signalsObserved: result.signalsObserved,
    incidents,
    confidenceInvestigationClaimed: Boolean(confidenceIncident),
    remediation,
    collectorErrors: result.collectorErrors,
  }, { status })
}
export async function POST(req: NextRequest) { return GET(req) }
