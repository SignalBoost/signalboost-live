// saas/app/api/hub/cyber/dependencies/route.ts
// Cybersecurity Center: manual dependency scans + monitor configuration + alert inbox
// + remediation requests where the fix plan is prepared before human approval.
// No fixes, commits, PRs, or merges are performed automatically.

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

function summarizeReport(report: any) {
  const s = report?.summary || {}
  return {
    packagesScanned: Number(s.packagesScanned || 0),
    advisories: Number(s.advisories || 0),
    critical: Number(s.critical || 0),
    high: Number(s.high || 0),
    medium: Number(s.medium || 0),
    low: Number(s.low || 0),
    unknown: Number(s.unknown || 0),
  }
}

function remediationFindings(report: any) {
  const advisories = Array.isArray(report?.advisories) ? report.advisories : []
  return advisories.slice(0, 50).map((a: any) => ({
    id: a.id,
    packageName: a.packageName,
    version: a.version,
    severity: a.severity,
    summary: a.summary,
    detailsUrl: a.detailsUrl || null,
    sourceFile: a.sourceFile || null,
  }))
}

function safeFindings(value: unknown): any[] {
  return Array.isArray(value) ? value : []
}

function buildFixPlan(row: any) {
  const findings = safeFindings(row?.findings)
  const packageMap = new Map<string, any>()
  for (const f of findings) {
    const key = `${f.packageName || 'package'}@${f.version || 'unknown'}`
    if (!packageMap.has(key)) packageMap.set(key, f)
  }
  const proposedChanges = Array.from(packageMap.values()).map((f: any) => ({
    packageName: f.packageName || 'package',
    currentVersion: f.version || 'unknown',
    advisoryId: f.id || 'unknown advisory',
    severity: f.severity || 'unknown',
    sourceFile: f.sourceFile || 'unknown file',
    proposedAction: 'Update this dependency to a safe patched compatible version, regenerate the lockfile, and run the build/test suite before deployment.',
    changeType: 'dependency_update',
  }))

  return {
    planVersion: 1,
    generatedAt: new Date().toISOString(),
    title: `Fix plan for ${row?.repo || row?.target || 'repository'}`,
    summary: `SignalBoost prepared a remediation plan for ${findings.length} detected dependency advisory finding(s). This is a plan only; no code has been changed and no pull request has been opened.`,
    proposedChanges,
    validationSteps: [
      'Confirm the recommended patched version for each affected package.',
      'Update package.json and the lockfile in a dedicated branch.',
      'Run npm install or the project package-manager equivalent.',
      'Run npm run build and the available test/lint commands.',
      'Review the diff manually before opening or merging a pull request.',
    ],
    safetyControls: [
      'The fix plan is shown before the first human approval.',
      'Approving this plan does not automatically edit code, commit changes, open a pull request, or merge anything.',
      'Creating a PR or assisted code change requires a separate product layer and explicit human authorization.',
    ],
    nextStep: 'Review this plan. Approving it only authorizes SignalBoost to move the request toward PR preparation; it does not change code automatically.',
  }
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
  const [scans, monitors, alerts, remediationRequests] = await Promise.all([
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
    admin.from('remediation_requests')
      .select('id,source_area,source_type,source_id,repo,target,title,summary,severity_summary,findings,status,human_approval_required,human_approved,approved_at,approval_notes,fix_plan,fix_plan_status,fix_plan_created_at,fix_plan_approved,fix_plan_approved_at,implementation_status,implementation_notes,pull_request_url,created_at,updated_at')
      .eq('source_area', 'cybersecurity')
      .order('created_at', { ascending: false })
      .limit(50),
  ])
  return {
    scans: scans.error ? [] : (scans.data || []),
    monitors: monitors.error ? [] : (monitors.data || []),
    alerts: alerts.error ? [] : (alerts.data || []),
    remediationRequests: remediationRequests.error ? [] : (remediationRequests.data || []),
  }
}

async function prepareFixPlan(admin: any, remediationId: string) {
  const { data: row, error } = await admin.from('remediation_requests')
    .select('id,repo,target,findings,severity_summary,status,human_approved')
    .eq('id', remediationId)
    .single()
  if (error || !row) return { ok: false, error: error?.message || 'Remediation request not found.' }
  const plan = buildFixPlan(row)
  const now = new Date().toISOString()
  const update = await admin.from('remediation_requests').update({
    fix_plan: plan,
    fix_plan_status: 'ready_for_review',
    fix_plan_created_at: now,
    implementation_status: 'not_started',
    updated_at: now,
  }).eq('id', remediationId).select('id,fix_plan,fix_plan_status,fix_plan_created_at').single()
  if (update.error) return { ok: false, error: update.error.message }
  return { ok: true, remediationRequest: update.data }
}

export async function GET() {
  const guard = await requireAdmin()
  if (!guard.ok) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status })
  try {
    return NextResponse.json({ ok: true, ...(await loadDashboardData()) })
  } catch {
    return NextResponse.json({ ok: true, scans: [], monitors: [], alerts: [], remediationRequests: [] })
  }
}

export async function POST(req: Request) {
  const guard = await requireAdmin()
  if (!guard.ok) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status })
  const userId = userIdFromGuard(guard)

  let body: { action?: string; url?: string; label?: string; frequency?: string; maxPackages?: number; scanId?: string | null; report?: any; notes?: string; remediationId?: string } = {}
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

  if (body.action === 'prepare_fix_plan') {
    if (!body.remediationId) return NextResponse.json({ ok: false, error: 'remediationId is required.' }, { status: 400 })
    const result = await prepareFixPlan(getAdminSupabase(), body.remediationId)
    return NextResponse.json(result, { status: result.ok ? 200 : 400 })
  }

  if (body.action === 'request_remediation') {
    const report = body.report || {}
    const findings = remediationFindings(report)
    if (findings.length === 0) {
      return NextResponse.json({ ok: false, error: 'No detected findings were supplied for remediation.' }, { status: 400 })
    }
    try {
      const summary = summarizeReport(report)
      const repo = report.repo || report.target || null
      const target = report.target || null
      const plan = buildFixPlan({ repo, target, findings, severity_summary: summary })
      const now = new Date().toISOString()
      const admin = getAdminSupabase()
      const { data, error } = await admin.from('remediation_requests').insert({
        user_id: userId,
        source_area: 'cybersecurity',
        source_type: 'dependency_scan',
        source_id: body.scanId || null,
        repo,
        target,
        title: `Dependency remediation plan: ${repo || 'repository'}`,
        summary: `SignalBoost prepared a proposed remediation plan for ${summary.advisories} dependency advisory finding(s). Human approval is required before PR preparation or any code change.`,
        severity_summary: summary,
        findings,
        status: 'awaiting_human_review',
        human_approval_required: true,
        human_approved: false,
        approval_notes: String(body.notes || '').trim() || null,
        fix_plan: plan,
        fix_plan_status: 'ready_for_review',
        fix_plan_created_at: now,
        fix_plan_approved: false,
        implementation_status: 'not_started',
      }).select('id,title,status,fix_plan,fix_plan_status,created_at').single()
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true, remediationRequest: data })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not create remediation plan.'
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
  const userId = userIdFromGuard(guard)
  let body: { alertId?: string; monitorId?: string; remediationId?: string; status?: string; isEnabled?: boolean; approvalNotes?: string; planAction?: string } = {}
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
    if (body.remediationId && body.planAction === 'approve_fix_plan') {
      const now = new Date().toISOString()
      const { error } = await admin.from('remediation_requests').update({
        status: 'approved',
        human_approved: true,
        approved_by: userId,
        approved_at: now,
        fix_plan_status: 'approved_for_pr',
        fix_plan_approved: true,
        fix_plan_approved_at: now,
        implementation_status: 'awaiting_pr_preparation',
        updated_at: now,
      }).eq('id', body.remediationId)
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true })
    }
    if (body.remediationId) {
      const status = ['awaiting_human_review', 'approved', 'rejected', 'in_progress', 'completed', 'cancelled'].includes(String(body.status)) ? String(body.status) : 'awaiting_human_review'
      const now = new Date().toISOString()

      if (status === 'approved') {
        const row = await admin.from('remediation_requests')
          .select('id,repo,target,findings,severity_summary,fix_plan')
          .eq('id', body.remediationId)
          .single()
        const existingPlan = row.data?.fix_plan && Object.keys(row.data.fix_plan).length > 0 ? row.data.fix_plan : buildFixPlan(row.data)
        const { error } = await admin.from('remediation_requests').update({
          status: 'approved',
          human_approved: true,
          approved_by: userId,
          approved_at: now,
          approval_notes: String(body.approvalNotes || '').trim() || null,
          fix_plan: existingPlan,
          fix_plan_status: 'approved_for_pr',
          fix_plan_approved: true,
          fix_plan_approved_at: now,
          implementation_status: 'awaiting_pr_preparation',
          updated_at: now,
        }).eq('id', body.remediationId)
        if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
        return NextResponse.json({ ok: true })
      }

      const { error } = await admin.from('remediation_requests').update({
        status,
        human_approved: false,
        approved_by: null,
        approved_at: null,
        approval_notes: String(body.approvalNotes || '').trim() || null,
        fix_plan_status: status === 'rejected' ? 'rejected' : undefined,
        fix_plan_approved: false,
        updated_at: now,
      }).eq('id', body.remediationId)
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true })
    }
    return NextResponse.json({ ok: false, error: 'No alertId, monitorId, or remediationId supplied.' }, { status: 400 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Update failed.'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
