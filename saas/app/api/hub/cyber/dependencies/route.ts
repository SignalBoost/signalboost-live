// saas/app/api/hub/cyber/dependencies/route.ts
// Cybersecurity Center MVP: dependency advisory scan API.
// Owner/admin-gated; stores scan summaries when Supabase is configured.

import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/access'
import { getAdminSupabase } from '@/utils/supabase/server'
import { scanDependencyAdvisories } from '@/lib/cyber/dependencyScanner'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 120

async function storeScan(report: any, userId: string | null) {
  try {
    const admin = getAdminSupabase()
    await admin.from('cyber_dependency_scans').insert({
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
    })
  } catch {
    // Storage is best-effort. The user still receives the scan result.
  }
}

export async function GET() {
  const guard = await requireAdmin()
  if (!guard.ok) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status })
  try {
    const admin = getAdminSupabase()
    const { data, error } = await admin
      .from('cyber_dependency_scans')
      .select('id,target,repo,branch,packages_scanned,advisories_count,critical,high,medium,low,unknown,created_at')
      .order('created_at', { ascending: false })
      .limit(20)
    if (error) return NextResponse.json({ ok: true, scans: [] })
    return NextResponse.json({ ok: true, scans: data || [] })
  } catch {
    return NextResponse.json({ ok: true, scans: [] })
  }
}

export async function POST(req: Request) {
  const guard = await requireAdmin()
  if (!guard.ok) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status })
  const userId = (guard as any).ctx?.userId ?? (guard as any).ctx?.user?.id ?? null

  let body: { url?: string; maxPackages?: number } = {}
  try { body = await req.json() } catch { /* defaults */ }

  const report = await scanDependencyAdvisories({ url: body.url, maxPackages: body.maxPackages })
  await storeScan(report, userId)
  return NextResponse.json({ ok: report.ok, report, error: report.error })
}
