import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { saasSupabaseCookieOptions } from '@/lib/auth/cookies'
import { accessFromVerifiedIdentity } from '@/lib/auth/access'
import { getAdminSupabase } from '@/utils/supabase/server'
import { PUBLIC_BRAND } from '@/lib/public-brand'
import { runNativeMonitoring } from '@/self-healing-host/native-monitoring-runtime'
import { ownedSiteOptimizationMonitoringCollector } from '@/self-healing-host/owned-site-optimization-monitoring'
import { remediateNativeIncidents } from '@/self-healing-host/native-autonomous-loop'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

type OwnerIdentity = Readonly<{ id: string; email: string | null }>
type RepairRow = Readonly<{
  id: string
  status: string
  created_at?: string | null
  started_at?: string | null
  finished_at?: string | null
  updated_at?: string | null
  error?: string | null
  result?: unknown
  metadata?: unknown
}>

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function positiveInteger(value: unknown): number | null {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

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

async function verifiedOwner(): Promise<OwnerIdentity | null> {
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
  if (!user?.id) return null
  if (!accessFromVerifiedIdentity(user.id, user.email).isOwner) return null
  return Object.freeze({ id: user.id, email: user.email ?? null })
}

async function latestOwnedRepair(userId: string): Promise<RepairRow | null> {
  const db = getAdminSupabase()
  const { data, error } = await db.from('builder_jobs')
    .select('id,status,created_at,started_at,finished_at,updated_at,error,result,metadata')
    .eq('user_id', userId)
    .contains('metadata', { selfHealingOwnedSite: true, selfHealingSource: 'website-optimizer' })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(`owned_site_repair_status_read_failed:${error.message}`)
  if (!data?.id) return null
  return data as RepairRow
}

function repairFailureMessage(errorValue: unknown): string {
  const code = text(errorValue)
  if (code === 'builder_round_budget_exhausted') return 'Automatic repair stopped before a verified fix because Builder exhausted its repair-round budget.'
  if (code === 'builder_stalled_repeated_inspection') return 'Automatic repair stopped before a verified fix because Builder stalled during repeated inspection.'
  if (code === 'builder_repository_target_superseded') return 'Automatic repair stopped because the pinned repository revision was superseded before merge. A fresh repair must use the current Production revision.'
  if (code === 'builder_turn_timeout') return 'Automatic repair stopped before a verified fix because the Builder execution window expired.'
  return code ? `Automatic repair stopped before Production verification (${code}).` : 'Automatic repair stopped before Production verification.'
}

function durableRepairState(row: RepairRow) {
  const result = record(row.result)
  const pullRequestNumber = positiveInteger(result.pull_request_number)
  const mergeCommitSha = text(result.merge_commit_sha)
  const base = {
    jobId: row.id,
    jobStatus: row.status,
    pullRequestNumber,
    mergeCommitSha: mergeCommitSha || null,
    createdAt: row.created_at ?? null,
    startedAt: row.started_at ?? null,
    finishedAt: row.finished_at ?? null,
    updatedAt: row.updated_at ?? null,
  }

  if (row.status === 'queued') return { ...base, ok: true, status: 'queued', message: 'Self-Healing detected the verified iTMounts findings and queued the automatic repository repair.' }
  if (row.status === 'running') return { ...base, ok: true, status: 'fixing', message: 'Self-Healing is fixing the verified iTMounts findings now.' }
  if (row.status === 'paused' && result.repository_merge_pending === true) {
    return {
      ...base,
      ok: true,
      status: 'testing',
      message: pullRequestNumber
        ? `Automatic repair created PR #${pullRequestNumber}; CI and governed merge checks are running.`
        : 'Automatic repair produced a candidate change; CI and governed merge checks are running.',
    }
  }
  if (row.status === 'paused') return { ...base, ok: true, status: 'paused', message: 'Automatic repair is paused before Production verification.' }
  if (row.status === 'failed') return { ...base, ok: false, status: 'failed', message: repairFailureMessage(row.error || result.error) }
  if (row.status === 'succeeded') return { ...base, ok: true, status: 'verifying', message: 'The governed repair merged successfully. iTMounts is independently rechecking Production before calling it fixed.' }
  return { ...base, ok: false, status: 'unknown', message: `Automatic repair is in an unrecognized state (${row.status || 'unknown'}).` }
}

async function productionVerification() {
  const collector = ownedSiteOptimizationMonitoringCollector({ apiBaseUrl: PUBLIC_BRAND.siteUrl })
  try {
    const incidents = await collector.observer.observe({
      provider: 'signalboost-platform',
      environment: 'production',
      metadata: { source: 'owner-website-optimizer-completion-verification', readOnly: true, providerMutations: false },
    })
    return { incidents, error: null as string | null }
  } catch (error) {
    return { incidents: [], error: error instanceof Error ? error.message.slice(0, 220) : 'production_verification_failed' }
  }
}

async function statusResponse(owner: OwnerIdentity) {
  let row: RepairRow | null
  try {
    row = await latestOwnedRepair(owner.id)
  } catch (error) {
    return NextResponse.json({
      ok: false,
      status: 'status_unavailable',
      target: PUBLIC_BRAND.siteUrl,
      message: error instanceof Error ? error.message : 'Automatic repair status is unavailable.',
    }, { status: 503 })
  }

  if (!row) {
    return NextResponse.json({
      ok: true,
      status: 'idle',
      target: PUBLIC_BRAND.siteUrl,
      message: 'No automatic iTMounts Website Optimizer repair job has been recorded yet.',
    })
  }

  const state = durableRepairState(row)
  if (state.status !== 'verifying') return NextResponse.json({ ...state, target: PUBLIC_BRAND.siteUrl })

  const verification = await productionVerification()
  if (verification.error) {
    return NextResponse.json({
      ...state,
      ok: false,
      status: 'verification_failed',
      target: PUBLIC_BRAND.siteUrl,
      message: 'The repair merged, but the protected Production recheck could not complete. It is not being called fixed.',
      verificationError: verification.error,
    }, { status: 503 })
  }

  if (verification.incidents.length === 0) {
    return NextResponse.json({
      ...state,
      ok: true,
      status: 'fixed',
      target: PUBLIC_BRAND.siteUrl,
      message: 'Fixed ✅ — the governed repair merged and the protected Production recheck found no Website Optimizer findings.',
    })
  }

  return NextResponse.json({
    ...state,
    ok: false,
    status: 'verification_failed',
    target: PUBLIC_BRAND.siteUrl,
    message: 'The repair merged, but Production still has Website Optimizer findings. It is not fixed yet.',
    report: verification.incidents[0]?.metadata?.report ?? null,
  }, { status: 409 })
}

export async function GET(req: Request) {
  if (!sameOriginOk(req)) {
    return NextResponse.json({ ok: false, error: 'cross_origin_rejected', message: 'The owner status request was rejected because it did not originate from this iTMounts session.' }, { status: 403 })
  }
  const owner = await verifiedOwner()
  if (!owner) {
    return NextResponse.json({ ok: false, error: 'owner_authorization_required', message: 'Owner authorization is required to view iTMounts Self-Healing status.' }, { status: 403 })
  }
  return statusResponse(owner)
}

export async function POST(req: Request) {
  if (!sameOriginOk(req)) {
    return NextResponse.json({ ok: false, error: 'cross_origin_rejected', message: 'The owner repair request was rejected because it did not originate from this iTMounts session.' }, { status: 403 })
  }

  const owner = await verifiedOwner()
  if (!owner) {
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
  if (!first || first.outcome === 'unavailable') {
    return NextResponse.json({
      ok: false,
      status: 'repair_unavailable',
      target: PUBLIC_BRAND.siteUrl,
      message: first?.message || 'Self-Healing could not start a safe repair for this verified incident.',
      incidentCount: monitoring.incidents.length,
      report: monitoring.incidents[0]?.metadata?.report ?? null,
      remediation,
    }, { status: 503 })
  }

  const latest = await latestOwnedRepair(owner.id).catch(() => null)
  if (latest) {
    return NextResponse.json({
      ...durableRepairState(latest),
      target: PUBLIC_BRAND.siteUrl,
      incidentCount: monitoring.incidents.length,
      report: monitoring.incidents[0]?.metadata?.report ?? null,
      remediation,
    })
  }

  return NextResponse.json({
    ok: true,
    status: 'repair_started',
    target: PUBLIC_BRAND.siteUrl,
    message: first.message || 'The verified iTMounts findings entered the Self-Healing repair workflow.',
    incidentCount: monitoring.incidents.length,
    report: monitoring.incidents[0]?.metadata?.report ?? null,
    remediation,
  })
}
