import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { saasSupabaseCookieOptions } from '@/lib/auth/cookies'
import { accessFromVerifiedIdentity } from '@/lib/auth/access'
import { PUBLIC_BRAND } from '@/lib/public-brand'
import { runNativeMonitoring } from '@/self-healing-host/native-monitoring-runtime'
import { ownedSiteOptimizationMonitoringCollector } from '@/self-healing-host/owned-site-optimization-monitoring'
import { remediateNativeIncidents } from '@/self-healing-host/native-autonomous-loop'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

function sameOriginOk(req: Request): boolean {
  const origin = req.headers.get('origin')
  if (!origin) return true
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host')
  if (!host) return false
  try {
    return new URL(origin).host === host.split(',')[0]?.trim()
  } catch {
    return false
  }
}

async function verifiedOwner(): Promise<boolean> {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: saasSupabaseCookieOptions,
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
          } catch {
            // Server-component cookie writes are irrelevant to this authorization check.
          }
        },
      },
    },
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.id) return false
  return accessFromVerifiedIdentity(user.id, user.email).isOwner
}

export async function POST(req: Request) {
  if (!sameOriginOk(req)) {
    return NextResponse.json({ ok: false, error: 'cross_origin_rejected', message: 'The owner repair request was rejected because it did not originate from this iTMounts session.' }, { status: 403 })
  }

  if (!(await verifiedOwner())) {
    return NextResponse.json({ ok: false, error: 'owner_authorization_required', message: 'Owner authorization is required to start iTMounts Self-Healing.' }, { status: 403 })
  }

  const monitoring = await runNativeMonitoring({
    context: {
      provider: 'signalboost-platform',
      environment: 'production',
      metadata: {
        source: 'owner-manual-website-optimizer',
        readOnly: true,
        providerMutations: false,
      },
    },
    collectors: [ownedSiteOptimizationMonitoringCollector({ apiBaseUrl: PUBLIC_BRAND.siteUrl })],
    nativeEnabled: process.env.SELF_HEALING_NATIVE_MONITORING_ENABLED !== 'false',
    externalConnected: process.env.SELF_HEALING_EXTERNAL_MONITORING_CONNECTED === 'true',
  })

  if (!monitoring.collectorsRun.length) {
    return NextResponse.json({
      ok: false,
      status: 'disabled',
      target: PUBLIC_BRAND.siteUrl,
      error: 'owned_site_self_healing_disabled',
      message: 'Owned-site Self-Healing is disabled, so no repair was started.',
    }, { status: 503 })
  }

  if (monitoring.collectorErrors.length) {
    return NextResponse.json({
      ok: false,
      status: 'monitoring_failed',
      target: PUBLIC_BRAND.siteUrl,
      message: 'The protected server-side iTMounts verification could not complete, so no repair was started.',
      collectorErrors: monitoring.collectorErrors,
    }, { status: 503 })
  }

  if (!monitoring.incidents.length) {
    return NextResponse.json({
      ok: true,
      status: 'healthy',
      target: PUBLIC_BRAND.siteUrl,
      message: 'The protected server-side iTMounts verification found no optimizer findings that require Self-Healing.',
      incidentCount: 0,
      remediation: [],
    })
  }

  const remediation = await remediateNativeIncidents(monitoring.incidents, { maxIncidents: 1 })
  const first = remediation[0]
  const unavailable = !first || first.outcome === 'unavailable'
  const message = first?.message || (unavailable
    ? 'Self-Healing could not start a safe repair for this verified incident.'
    : 'The verified iTMounts findings entered the Self-Healing repair workflow.')

  return NextResponse.json({
    ok: !unavailable,
    status: unavailable ? 'repair_unavailable' : 'repair_started',
    target: PUBLIC_BRAND.siteUrl,
    message,
    incidentCount: monitoring.incidents.length,
    report: monitoring.incidents[0]?.metadata?.report ?? null,
    remediation,
  }, { status: unavailable ? 503 : 200 })
}
