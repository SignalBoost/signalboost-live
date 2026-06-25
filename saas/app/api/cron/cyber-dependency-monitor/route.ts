// saas/app/api/cron/cyber-dependency-monitor/route.ts
// Scheduled cybersecurity monitoring job.
// Configure Vercel Cron or an external scheduler to call this route with:
//   Authorization: Bearer $CRON_SECRET

import { NextResponse } from 'next/server'
import { getAdminSupabase } from '@/utils/supabase/server'
import { scanDependencyAdvisories } from '@/lib/cyber/dependencyScanner'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

type Monitor = {
  id: string
  user_id: string | null
  repo_url: string
  frequency: 'daily' | 'weekly' | string
  is_enabled: boolean
  last_scan_at?: string | null
}

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const auth = req.headers.get('authorization') || ''
  return auth === `Bearer ${secret}`
}

function due(m: Monitor): boolean {
  if (!m.is_enabled) return false
  if (!m.last_scan_at) return true
  const last = Date.parse(m.last_scan_at)
  if (!Number.isFinite(last)) return true
  const ageHours = (Date.now() - last) / 3_600_000
  return String(m.frequency).toLowerCase() === 'weekly' ? ageHours >= 24 * 6.5 : ageHours >= 23
}

async function storeScan(admin: any, report: any, userId: string | null): Promise<string | null> {
  try {
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
    return data?.id || null
  } catch { return null }
}

async function insertAlert(admin: any, row: Record<string, unknown>): Promise<boolean> {
  try {
    // Avoid relying on partial-index upsert support; check open duplicate first.
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
    const { error } = await admin.from('cyber_alerts').insert(row)
    return !error
  } catch { return false }
}

async function createAlerts(admin: any, opts: { monitor: Monitor; report: any; scanId: string | null }): Promise<number> {
  const advisories = Array.isArray(opts.report?.advisories) ? opts.report.advisories : []
  const urgent = advisories.filter((a: any) => a?.severity === 'critical' || a?.severity === 'high').slice(0, 50)
  let created = 0
  for (const a of urgent) {
    const ok = await insertAlert(admin, {
      user_id: opts.monitor.user_id,
      monitor_id: opts.monitor.id,
      scan_id: opts.scanId,
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

export async function GET(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized cron request.' }, { status: 401 })
  }

  const admin = getAdminSupabase()
  try {
    const { data, error } = await admin
      .from('cyber_monitored_repositories')
      .select('id,user_id,repo_url,frequency,is_enabled,last_scan_at')
      .eq('is_enabled', true)
      .limit(50)

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

    const monitors = ((data || []) as Monitor[]).filter(due)
    const results: any[] = []

    for (const monitor of monitors) {
      const report = await scanDependencyAdvisories({ url: monitor.repo_url, maxPackages: 200 })
      const scanId = await storeScan(admin, report, monitor.user_id)
      const alertsCreated = await createAlerts(admin, { monitor, report, scanId })

      await admin.from('cyber_monitored_repositories').update({
        repo: report.repo || null,
        branch: report.branch || null,
        last_scan_at: new Date().toISOString(),
        last_status: report.ok ? 'complete' : 'failed',
        last_error: report.error || null,
        last_advisories: report.summary?.advisories || 0,
        last_critical: report.summary?.critical || 0,
        last_high: report.summary?.high || 0,
        updated_at: new Date().toISOString(),
      }).eq('id', monitor.id)

      results.push({ monitorId: monitor.id, ok: report.ok, scanId, alertsCreated, summary: report.summary, error: report.error })
    }

    return NextResponse.json({ ok: true, checked: monitors.length, results })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Cyber monitor run failed.'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
