// saas/app/api/hub/cyber/dependencies/route.ts
// Cybersecurity Center: manual dependency scans + monitor configuration + alert inbox.
// Owner/admin-gated; storage is best-effort so scans still return if tables are missing.

import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/access'
import { getAdminSupabase } from '@/utils/supabase/server'
import { scanDependencyAdvisories } from '@/lib/cyber/dependencyScanner'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 120

type StoredScan = { id?: string | null }

function userIdFromGuard(guard: any): string | null {
  return guard?.ctx?.userId ?? guard?.ctx?.user?.id ?? guard?.ctx?.id ?? null
}

function safeFrequency(value: unknown): 'daily' | 'weekly' {
  return String(value || '').toLowerCase() === 'weekly' ? 'weekly' : 'daily'
}

async function storeScan(report: any, userId: string | null): Promise<StoredScan> {
  try {
    const admin = getAdminSupabase()
    const { data } = await admin.from('cyber_dependency_scans').insert({
      user_id: userId,
      target: report.target,
      repo: report.repo,
      branch: report.branch,
      packages_scanned: report.summary?.packagesScanned || 0,
      advisories_count: report.summary?.advisories || 0,
      critical: report.summary?.critical || 0,
      high: report.summary?.high || 0,
      medium: report.summary?.medium || 0,
      low: report.summary?.low || 0,
      unknown: report.summary?.unknown || 0,
      report,
    }).select('id').single()
    return { id: data?.id || null }
  } catch {
    return { id: null }
  }
}

async function insertAlert(admin: any, row: Record<string, unknown>): Promise<boolean> {
  try {
    // Manual scans may not have a monitor_id. In that case every scan is allowed
    // to create its own alert row; monitored scans dedupe open alerts per monitor.
    if (row.monitor_id) {
      const dup = await admin.from('cyber_alerts')
        .select('id')
        .eq('monitor_id', row.monitor_id)
        .eq('advisory_id', row.advisory_id)
        .eq('package_name', row.package_name)
        .eq('package_version', row.package_version)
        .eq('status', 'open')
        .limit(1)
        .maybeSingle()
      if (dup?.data?.id) return false
    }
    const { error } = await admin.from('cyber_alerts').insert(row)
    return !error
  } catch { return false }
}

async function createAlertsForReport(opts: { report: any; userId: string | null; monitorId?: string | null; scanId?: string | null }) {
  const advisories = Array.isArray(opts.report?.advisories) ? opts.report.advisories : []
  const urgent = advisories.filter((a: any) => a?.severity === 'critical' || a?.severity === 'high').slice(0, 50)
  if (urgent.length === 0) return 0
  const admin = getAdminSupabase()
  let created = 0
  for (const a of urgent) {
    const ok = await insertAlert(admin, {
      user_id: opts.userId,
      monitor_id: opts.monitorId || null,
      scan_id: opts.scanId || null,
      repo: opts.report?.repo || opts.report?.target || null,
      severity: a.severity,
      advisory_id: a.id,
      package_name: a.packageName,
      package_version: a.version,
      title: `${String(a.severity).toUpperCase()}: ${a.packageName}@${a.version}`,
      message: a.summary || 'Dependency advisory found.',
      details_url: a.detailsUrl || null,
      status: 'open',
    })
    if (ok) created++
  }
  return created
}

async function loadDashboardData() {
  const admin = getAdminSupabase()
  const [scans, monitors, alerts] = await Promise.all([
    admin.from('cyber_dependency_scans')
      .select('id,target,repo,branch,packages_scanned,advisories_count,critical,high,medium,low,unknown,created_at')
      .order('created_at', { ascending: false })
      .limit(20),
    admin.from('cyber_monitored_repositories')
      .select('id,label,repo_url,repo,branch,frequency,is_enabled,last_scan_at,last_status,last_error,last_advisories,last_critical,last_high,created_at')
      .order('created_at', { ascending: false })
      .limit(50),
    admin.from('cyber_alerts')
      .select('id,monitor_id,scan_id,repo,severity,advisory_id,package_name,package_version,title,message,details_url,status,created_at,resolved_at')
      .order('created_at', { ascending: false })
      .limit(100),
  ])
  return {
    scans: scans.error ? [] : (scans.data || []),
    monitors: monitors.error ? [] : (monitors.data || []),
    alerts: alerts.error ? [] : (alerts.data || []),
  }
}

export async function GET() {
  const guard = await requireAdmin()
  if (!guard.ok) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status })
  try {
    return NextResponse.json({ ok: true, ...(await loadDashboardData()) })
  } catch {
    return NextResponse.json({ ok: true, scans: [], monitors: [], alerts: [] })
  }
}

export async function POST(req: Request) {
  const guard = await requireAdmin()
  if (!guard.ok) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status })
  const userId = userIdFromGuard(guard)

  let body: { action?: string; url?: string; label?: string; frequency?: string; maxPackages?: number } = {}
  try { body = await req.json() } catch { /* defaults */ }

  if (body.action === 'create_monitor') {
    const repoUrl = String(body.url || '').trim()
    if (!repoUrl) return NextResponse.json({ ok: false, error: 'Repository URL is required.' }, { status: 400 })
    try {
      const admin = getAdminSupabase()
      const { data, error } = await admin.from('cyber_monitored_repositories').insert({
        user_id: userId,
        label: String(body.label || '').trim() || null,
        repo_url: repoUrl,
        frequency: safeFrequency(body.frequency),
        is_enabled: true,
      }).select('id,label,repo_url,frequency,is_enabled,created_at').single()
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true, monitor: data })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not create monitor.'
      return NextResponse.json({ ok: false, error: message }, { status: 500 })
    }
  }

  const report = await scanDependencyAdvisories({ url: body.url, maxPackages: body.maxPackages })
  const stored = await storeScan(report, userId)
  const alertsCreated = await createAlertsForReport({ report, userId, scanId: stored.id })
  return NextResponse.json({ ok: report.ok, report, scanId: stored.id, alertsCreated, error: report.error })
}

export async function PATCH(req: Request) {
  const guard = await requireAdmin()
  if (!guard.ok) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status })
  let body: { alertId?: string; monitorId?: string; status?: string; isEnabled?: boolean } = {}
  try { body = await req.json() } catch { /* defaults */ }

  try {
    const admin = getAdminSupabase()
    if (body.alertId) {
      const status = ['open', 'resolved', 'ignored'].includes(String(body.status)) ? String(body.status) : 'resolved'
      const { error } = await admin.from('cyber_alerts').update({ status, resolved_at: status === 'open' ? null : new Date().toISOString() }).eq('id', body.alertId)
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true })
    }
    if (body.monitorId) {
      const { error } = await admin.from('cyber_monitored_repositories').update({ is_enabled: !!body.isEnabled, updated_at: new Date().toISOString() }).eq('id', body.monitorId)
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true })
    }
    return NextResponse.json({ ok: false, error: 'No alertId or monitorId supplied.' }, { status: 400 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Update failed.'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
