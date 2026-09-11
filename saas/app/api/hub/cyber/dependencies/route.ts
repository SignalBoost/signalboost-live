// saas/app/api/hub/cyber/dependencies/route.ts
// Cybersecurity Center: manual dependency scans + monitor configuration + alert inbox
// + routine plan preparation from owned server-recorded scan evidence.
// Branch proposals use a separate bounded worker; this route never merges or deploys.

import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/access'
import { getAdminSupabase } from '@/utils/supabase/server'
import { scanDependencyAdvisories } from '@/lib/cyber/dependencyScanner'
import { routineDependencyState, isTerminalRemediation, sameOriginCyberMutation } from '@/lib/cyber/dependencyRemediationPolicy'
import { remediationAutonomyCopy } from '@/lib/cyber/remediationAutonomyCopy'
import { normalizeReportLang, reportLangFromCookie, type ReportLang } from '@/lib/i18n/reportLanguage'

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

function langFromRequest(req: Request, body?: { lang?: string }): ReportLang {
  return normalizeReportLang(body?.lang || reportLangFromCookie(req.headers.get('cookie')))
}

function cyberPlanCopy(lang: ReportLang) {
  const legacy = {
    en: {
      title: (repo: string) => `Fix plan for ${repo}`,
      updateAction: (target: string) => `Update this dependency to ${target}, regenerate the lockfile, and run the build/test suite before deployment.`,
      confirmAction: 'Confirm the patched compatible version, update this dependency, regenerate the lockfile, and run the build/test suite before deployment.',
      validation: ['Confirm the recommended patched version for each affected package.', 'Update package.json and the lockfile in a dedicated branch.', 'Run npm install or the project package-manager equivalent.', 'Run npm run build and the available test/lint commands.', 'Review the diff manually before opening or merging a pull request.'],
      requestTitle: (repo: string) => `Dependency remediation plan: ${repo}`,
    },
    es: {
      title: (repo: string) => `Plan de corrección para ${repo}`,
      updateAction: (target: string) => `Actualiza esta dependencia a ${target}, regenera el lockfile y ejecuta la compilación/pruebas antes del despliegue.`,
      confirmAction: 'Confirma la versión compatible corregida, actualiza esta dependencia, regenera el lockfile y ejecuta la compilación/pruebas antes del despliegue.',
      validation: ['Confirma la versión corregida recomendada para cada paquete afectado.', 'Actualiza package.json y el lockfile en una rama dedicada.', 'Ejecuta npm install o el equivalente del gestor de paquetes del proyecto.', 'Ejecuta npm run build y los comandos de prueba/lint disponibles.', 'Revisa el diff manualmente antes de abrir o fusionar un pull request.'],
      requestTitle: (repo: string) => `Plan de remediación de dependencias: ${repo}`,
    },
    pt: {
      title: (repo: string) => `Plano de correção para ${repo}`,
      updateAction: (target: string) => `Atualize esta dependência para ${target}, regenere o lockfile e execute a build/suíte de testes antes do deploy.`,
      confirmAction: 'Confirme a versão corrigida compatível, atualize esta dependência, regenere o lockfile e execute a build/suíte de testes antes do deploy.',
      validation: ['Confirme a versão corrigida recomendada para cada pacote afetado.', 'Atualize o package.json e o lockfile em um branch dedicado.', 'Execute npm install ou o equivalente do gerenciador de pacotes do projeto.', 'Execute npm run build e os comandos de teste/lint disponíveis.', 'Revise o diff manualmente antes de abrir ou mesclar um pull request.'],
      requestTitle: (repo: string) => `Plano de remediação de dependências: ${repo}`,
    },
    pl: {
      title: (repo: string) => `Plan naprawczy dla ${repo}`,
      updateAction: (target: string) => `Zaktualizuj tę zależność do ${target}, wygeneruj ponownie lockfile i uruchom build/testy przed wdrożeniem.`,
      confirmAction: 'Potwierdź zgodną poprawioną wersję, zaktualizuj zależność, wygeneruj ponownie lockfile i uruchom build/testy przed wdrożeniem.',
      validation: ['Potwierdź zalecaną poprawioną wersję każdego dotkniętego pakietu.', 'Zaktualizuj package.json i lockfile w osobnej gałęzi.', 'Uruchom npm install albo odpowiednik menedżera pakietów projektu.', 'Uruchom npm run build oraz dostępne testy/lint.', 'Przejrzyj diff ręcznie przed otwarciem lub scaleniem pull requesta.'],
      requestTitle: (repo: string) => `Plan naprawy zależności: ${repo}`,
    },
    ru: {
      title: (repo: string) => `План исправления для ${repo}`,
      updateAction: (target: string) => `Обновите эту зависимость до ${target}, пересоздайте lockfile и запустите сборку/тесты перед деплоем.`,
      confirmAction: 'Подтвердите совместимую исправленную версию, обновите зависимость, пересоздайте lockfile и запустите сборку/тесты перед деплоем.',
      validation: ['Подтвердите рекомендуемую исправленную версию для каждого затронутого пакета.', 'Обновите package.json и lockfile в отдельной ветке.', 'Запустите npm install или эквивалентный менеджер пакетов проекта.', 'Запустите npm run build и доступные команды test/lint.', 'Вручную проверьте diff перед открытием или слиянием pull request.'],
      requestTitle: (repo: string) => `План исправления зависимостей: ${repo}`,
    },
  }[lang]
  const policyCopy = remediationAutonomyCopy(lang)
  return { ...legacy, summary: (_count: number) => policyCopy.planSummary,
    requestSummary: (_count: number) => policyCopy.remediationPrepared,
    validation: [...legacy.validation.slice(0, -1), policyCopy.validateDiff],
    safety: policyCopy.safety, nextStep: policyCopy.prepareDescription }
}

function summarizeReport(report: any) {
  const s = report?.summary || {}
  return { packagesScanned: Number(s.packagesScanned || 0), advisories: Number(s.advisories || 0), critical: Number(s.critical || 0), high: Number(s.high || 0), medium: Number(s.medium || 0), low: Number(s.low || 0), unknown: Number(s.unknown || 0) }
}

function stringList(value: unknown): string[] { return Array.isArray(value) ? value.map(v => String(v || '').trim()).filter(Boolean) : [] }
function remediationFindings(report: any) { const advisories = Array.isArray(report?.advisories) ? report.advisories : []; return advisories.slice(0, 50).map((a: any) => ({ id: a.id, packageName: a.packageName, version: a.version, severity: a.severity, summary: a.summary, detailsUrl: a.detailsUrl || null, sourceFile: a.sourceFile || null, fixedVersions: stringList(a.fixedVersions), affectedRanges: stringList(a.affectedRanges) })) }
function safeFindings(value: unknown): any[] { return Array.isArray(value) ? value : [] }

function buildFixPlan(row: any, lang: ReportLang = 'en') {
  const copy = cyberPlanCopy(lang)
  const findings = safeFindings(row?.findings)
  const packageMap = new Map<string, any>()
  for (const f of findings) { const key = `${f.packageName || 'package'}@${f.version || 'unknown'}`; if (!packageMap.has(key)) packageMap.set(key, f) }
  const proposedChanges = Array.from(packageMap.values()).map((f: any) => { const fixedVersions = stringList(f.fixedVersions); const targetVersion = fixedVersions[0] || null; return { packageName: f.packageName || 'package', currentVersion: f.version || 'unknown', targetVersion, fixedVersions, affectedRanges: stringList(f.affectedRanges), advisoryId: f.id || 'unknown advisory', severity: f.severity || 'unknown', sourceFile: f.sourceFile || 'unknown file', proposedAction: targetVersion ? copy.updateAction(targetVersion) : copy.confirmAction, changeType: 'dependency_update' } })
  const repoLabel = row?.repo || row?.target || 'repository'
  return { planVersion: 1, generatedAt: new Date().toISOString(), title: copy.title(repoLabel), summary: copy.summary(findings.length), proposedChanges, validationSteps: copy.validation, safetyControls: copy.safety, nextStep: copy.nextStep }
}

async function storeScan(report: any, userId: string | null): Promise<StoredScan> {
  try { const admin = getAdminSupabase(); const { data } = await admin.from('cyber_dependency_scans').insert({ user_id: userId, target: report.target, repo: report.repo, branch: report.branch, packages_scanned: report.summary?.packagesScanned || 0, advisories_count: report.summary?.advisories || 0, critical: report.summary?.critical || 0, high: report.summary?.high || 0, medium: report.summary?.medium || 0, low: report.summary?.low || 0, unknown: report.summary?.unknown || 0, report }).select('id').single(); return { id: data?.id || null } } catch { return { id: null } }
}

async function insertAlert(admin: any, row: Record<string, unknown>): Promise<boolean> {
  try { if (row.monitor_id) { const dup = await admin.from('cyber_alerts').select('id').eq('monitor_id', row.monitor_id).eq('advisory_id', row.advisory_id).eq('package_name', row.package_name).eq('package_version', row.package_version).eq('status', 'open').limit(1).maybeSingle(); if (dup?.data?.id) return false } const { error } = await admin.from('cyber_alerts').insert(row); return !error } catch { return false }
}
async function createAlertsForReport(opts: { report: any; userId: string | null; monitorId?: string | null; scanId?: string | null }) { const advisories = Array.isArray(opts.report?.advisories) ? opts.report.advisories : []; const urgent = advisories.filter((a: any) => a?.severity === 'critical' || a?.severity === 'high').slice(0, 50); if (urgent.length === 0) return 0; const admin = getAdminSupabase(); let created = 0; for (const a of urgent) { const ok = await insertAlert(admin, { user_id: opts.userId, monitor_id: opts.monitorId || null, scan_id: opts.scanId || null, repo: opts.report?.repo || opts.report?.target || null, severity: a.severity, advisory_id: a.id, package_name: a.packageName, package_version: a.version, title: `${String(a.severity).toUpperCase()}: ${a.packageName}@${a.version}`, message: a.summary || 'Dependency advisory found.', details_url: a.detailsUrl || null, status: 'open' }); if (ok) created++ } return created }

async function loadDashboardData() {
  const admin = getAdminSupabase()
  const [scans, monitors, alerts, remediationRequests] = await Promise.all([
    admin.from('cyber_dependency_scans').select('id,target,repo,branch,packages_scanned,advisories_count,critical,high,medium,low,unknown,created_at').order('created_at', { ascending: false }).limit(20),
    admin.from('cyber_monitored_repositories').select('id,label,repo_url,repo,branch,frequency,is_enabled,last_scan_at,last_status,last_error,last_advisories,last_critical,last_high,created_at').order('created_at', { ascending: false }).limit(50),
    admin.from('cyber_alerts').select('id,monitor_id,scan_id,repo,severity,advisory_id,package_name,package_version,title,message,details_url,status,created_at,resolved_at').order('created_at', { ascending: false }).limit(100),
    admin.from('remediation_requests').select('id,source_area,source_type,source_id,repo,target,title,summary,severity_summary,findings,status,human_approval_required,human_approved,approved_at,approval_notes,fix_plan,fix_plan_status,fix_plan_created_at,fix_plan_approved,fix_plan_approved_at,implementation_status,implementation_notes,pull_request_url,created_at,updated_at').eq('source_area', 'cybersecurity').order('created_at', { ascending: false }).limit(50),
  ])
  return { scans: scans.error ? [] : (scans.data || []), monitors: monitors.error ? [] : (monitors.data || []), alerts: alerts.error ? [] : (alerts.data || []), remediationRequests: remediationRequests.error ? [] : (remediationRequests.data || []) }
}

function streamDependencyScan(body: { url?: string; maxPackages?: number }, userId: string | null) {
  const encoder = new TextEncoder()
  let closed = false
  let latest = { stage: 'starting', progress: 4, message: 'Starting dependency advisory scan.', done: 0, total: 0, at: new Date().toISOString() }

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (payload: Record<string, unknown>) => {
        if (closed) return
        try { controller.enqueue(encoder.encode(`${JSON.stringify(payload)}\n`)) } catch { closed = true }
      }
      const heartbeat = setInterval(() => send({ type: 'heartbeat', ...latest, at: new Date().toISOString() }), 10_000)

      void (async () => {
        try {
          const report = await scanDependencyAdvisories({
            url: body.url,
            maxPackages: body.maxPackages,
            onProgress(progress) { latest = { ...latest, ...progress, done: progress.done || 0, total: progress.total || 0 }; send({ type: 'progress', ...progress }) },
          })
          if (!report.ok) { send({ type: 'error', stage: 'failed', progress: latest.progress, error: report.error || 'Cybersecurity scan failed.', at: new Date().toISOString() }); return }
          latest = { stage: 'saving', progress: 94, message: 'Saving scan results.', done: report.summary.packagesScanned, total: report.summary.packagesScanned, at: new Date().toISOString() }
          send({ type: 'progress', ...latest })
          const stored = await storeScan(report, userId)
          latest = { ...latest, stage: 'alerts', progress: 97, message: 'Updating the cybersecurity alert inbox.', at: new Date().toISOString() }
          send({ type: 'progress', ...latest })
          const alertsCreated = await createAlertsForReport({ report, userId, scanId: stored.id })
          send({ type: 'complete', stage: 'complete', progress: 100, message: 'Cybersecurity scan completed.', report, scanId: stored.id, alertsCreated, at: new Date().toISOString() })
        } catch (error) {
          send({ type: 'error', stage: 'failed', progress: latest.progress, error: error instanceof Error ? error.message : 'Cybersecurity scan failed.', at: new Date().toISOString() })
        } finally {
          clearInterval(heartbeat)
          if (!closed) { closed = true; controller.close() }
        }
      })()
    },
    cancel() { closed = true },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-store, no-transform',
      'X-Accel-Buffering': 'no',
    },
  })
}

async function prepareFixPlan(admin: any, remediationId: string, lang: ReportLang, userId: string | null) {
  if (!userId) return { ok: false, error: 'Authenticated user identity is required.' }
  const { data: row, error } = await admin.from('remediation_requests')
    .select('id,user_id,source_area,source_type,source_id,repo,target,status,human_approved,implementation_status')
    .eq('id', remediationId).eq('user_id', userId).single()
  if (error || !row) return { ok: false, error: 'Remediation request not found.' }
  if (row.source_type === 'guardian_repository_change') return { ok: false, error: 'guardian_review_does_not_authorize_repair' }
  if (row.source_area !== 'cybersecurity' || row.source_type !== 'dependency_scan' || isTerminalRemediation(row))
    return { ok: false, error: 'Only an active dependency request can be prepared.' }
  if (['github_pr_preparing', 'github_pr_prepared'].includes(row.implementation_status)) return { ok: false, error: 'Preparation is already running or has produced a proposal.' }
  if (row.human_approved) return { ok: false, error: 'Preserve the existing approval record; use the preparation worker.' }
  const scan = await admin.from('cyber_dependency_scans').select('id,user_id,report')
    .eq('id', row.source_id).eq('user_id', userId).maybeSingle()
  if (scan.error || scan.data?.report?.ok !== true) return { ok: false, error: 'Owned server scan evidence is required.' }
  const findings = remediationFindings(scan.data.report)
  const plan = buildFixPlan({ ...row, findings }, lang)
  const now = new Date().toISOString()
  const update = await admin.from('remediation_requests').update({ ...routineDependencyState(),
    findings, fix_plan: plan, fix_plan_created_at: now, updated_at: now,
  }).eq('id', remediationId).eq('user_id', userId).eq('status', row.status).eq('implementation_status', row.implementation_status)
    .select('id,status,human_approval_required,fix_plan,fix_plan_status,implementation_status').single()
  if (update.error || !update.data) return { ok: false, error: 'Could not persist the preparation plan.' }
  return { ok: true, remediationRequest: update.data }
}

export async function GET() { const guard = await requireAdmin(); if (!guard.ok) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status }); try { return NextResponse.json({ ok: true, ...(await loadDashboardData()) }) } catch { return NextResponse.json({ ok: true, scans: [], monitors: [], alerts: [], remediationRequests: [] }) } }

export async function POST(req: Request) {
  const guard = await requireAdmin(); if (!guard.ok) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status }); const userId = userIdFromGuard(guard)
  if (!sameOriginCyberMutation(req)) return NextResponse.json({ ok: false, error: 'cross_origin_mutation_denied' }, { status: 403 })
  let body: { action?: string; url?: string; label?: string; frequency?: string; maxPackages?: number; scanId?: string | null; report?: any; notes?: string; remediationId?: string; lang?: string; stream?: boolean } = {}
  try { body = await req.json() } catch { /* defaults */ }
  const lang = langFromRequest(req, body)

  if (body.stream === true && !body.action) return streamDependencyScan(body, userId)
  if (body.action === 'create_monitor') { const repoUrl = String(body.url || '').trim(); if (!repoUrl) return NextResponse.json({ ok: false, error: 'Repository URL is required.' }, { status: 400 }); try { const admin = getAdminSupabase(); const { data, error } = await admin.from('cyber_monitored_repositories').insert({ user_id: userId, label: String(body.label || '').trim() || null, repo_url: repoUrl, frequency: safeFrequency(body.frequency), is_enabled: true }).select('id,label,repo_url,frequency,is_enabled,created_at').single(); if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 }); return NextResponse.json({ ok: true, monitor: data }) } catch (err) { const message = err instanceof Error ? err.message : 'Could not create monitor.'; return NextResponse.json({ ok: false, error: message }, { status: 500 }) } }
  if (body.action === 'prepare_fix_plan') { if (!body.remediationId) return NextResponse.json({ ok: false, error: 'remediationId is required.' }, { status: 400 }); const result = await prepareFixPlan(getAdminSupabase(), body.remediationId, lang, userId); return NextResponse.json(result, { status: result.ok ? 200 : 400 }) }
  if (body.action === 'request_remediation') {
    // Browser reports are display data, never authority for autonomous changes.
    if (!userId || !body.scanId) return NextResponse.json({ ok: false, error: 'A saved, owned scan is required.' }, { status: 400 })
    try {
      const admin = getAdminSupabase()
      const scan = await admin.from('cyber_dependency_scans').select('id,user_id,report')
        .eq('id', body.scanId).eq('user_id', userId).maybeSingle()
      if (scan.error || scan.data?.report?.ok !== true)
        return NextResponse.json({ ok: false, error: 'Owned server scan evidence is required.' }, { status: 400 })
      const report = scan.data.report
      const findings = remediationFindings(report)
      if (!findings.length) return NextResponse.json({ ok: false, error: 'No detected dependency findings.' }, { status: 400 })
      const summary = summarizeReport(report)
      const repo = report.repo || report.target || null
      const target = report.target || null
      const copy = cyberPlanCopy(lang)
      const plan = buildFixPlan({ repo, target, findings }, lang)
      const now = new Date().toISOString()
      const { data, error } = await admin.from('remediation_requests').insert({
        user_id: userId, source_area: 'cybersecurity', source_type: 'dependency_scan',
        source_id: scan.data.id, repo, target, title: copy.requestTitle(repo || 'repository'),
        summary: copy.requestSummary(summary.advisories), severity_summary: summary, findings,
        ...routineDependencyState(), approval_notes: String(body.notes || '').trim() || null,
        fix_plan: plan, fix_plan_created_at: now,
      }).select('id,title,status,human_approval_required,fix_plan,fix_plan_status,implementation_status,created_at').single()
      if (error || !data) return NextResponse.json({ ok: false, error: 'Could not persist the preparation plan.' }, { status: 500 })
      return NextResponse.json({ ok: true, remediationRequest: data })
    } catch { return NextResponse.json({ ok: false, error: 'Could not create remediation plan.' }, { status: 500 }) }
  }
  const report = await scanDependencyAdvisories({ url: body.url, maxPackages: body.maxPackages }); const stored = await storeScan(report, userId); const alertsCreated = await createAlertsForReport({ report, userId, scanId: stored.id }); return NextResponse.json({ ok: report.ok, report, scanId: stored.id, alertsCreated, error: report.error })
}

export async function PATCH(req: Request) {
  const guard = await requireAdmin(); if (!guard.ok) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status }); const userId = userIdFromGuard(guard)
  if (!sameOriginCyberMutation(req)) return NextResponse.json({ ok: false, error: 'cross_origin_mutation_denied' }, { status: 403 })
  let body: { alertId?: string; monitorId?: string; remediationId?: string; status?: string; isEnabled?: boolean; approvalNotes?: string; planAction?: string; lang?: string } = {}; try { body = await req.json() } catch { /* defaults */ }
  const lang = langFromRequest(req, body)
  try { const admin = getAdminSupabase(); if (body.alertId) { const status = ['open', 'resolved', 'ignored'].includes(String(body.status)) ? String(body.status) : 'resolved'; const { error } = await admin.from('cyber_alerts').update({ status, resolved_at: status === 'open' ? null : new Date().toISOString() }).eq('id', body.alertId); if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 }); return NextResponse.json({ ok: true }) } if (body.monitorId) { const { error } = await admin.from('cyber_monitored_repositories').update({ is_enabled: !!body.isEnabled, updated_at: new Date().toISOString() }).eq('id', body.monitorId); if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 }); return NextResponse.json({ ok: true }) } if (body.remediationId) { const source = await admin.from('remediation_requests').select('source_type,source_id').eq('id', body.remediationId).maybeSingle(); if (source.error || !source.data) return NextResponse.json({ ok: false, error: source.error?.message || 'Remediation request not found.' }, { status: 404 }); if (source.data.source_type === 'guardian_repository_change') { if (body.planAction === 'approve_fix_plan' || String(body.status) === 'approved') return NextResponse.json({ ok: false, error: 'guardian_review_does_not_authorize_repair' }, { status: 409 }); const status = ['awaiting_human_review', 'in_progress', 'rejected', 'completed', 'cancelled'].includes(String(body.status)) ? String(body.status) : 'awaiting_human_review'; const disposition = await admin.rpc('record_guardian_review_disposition', { p_remediation_id: body.remediationId, p_status: status, p_approval_notes: String(body.approvalNotes || '').trim() || null }); if (disposition.error) return NextResponse.json({ ok: false, error: disposition.error.message }, { status: 500 }); return NextResponse.json(disposition.data || { ok: true, reviewOnly: true, status }) } if (body.planAction === 'approve_fix_plan') { const now = new Date().toISOString(); const { error } = await admin.from('remediation_requests').update({ status: 'approved', human_approved: true, approved_by: userId, approved_at: now, fix_plan_status: 'approved_for_pr', fix_plan_approved: true, fix_plan_approved_at: now, implementation_status: 'awaiting_github_pr_preparation', updated_at: now }).eq('id', body.remediationId); if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 }); return NextResponse.json({ ok: true }) } const status = ['awaiting_human_review', 'approved', 'rejected', 'in_progress', 'completed', 'cancelled'].includes(String(body.status)) ? String(body.status) : 'awaiting_human_review'; const now = new Date().toISOString(); if (status === 'approved') { const row = await admin.from('remediation_requests').select('id,repo,target,findings,severity_summary,fix_plan').eq('id', body.remediationId).single(); const existingPlan = row.data?.fix_plan && Object.keys(row.data.fix_plan).length > 0 ? row.data.fix_plan : buildFixPlan(row.data, lang); const { error } = await admin.from('remediation_requests').update({ status: 'approved', human_approved: true, approved_by: userId, approved_at: now, approval_notes: String(body.approvalNotes || '').trim() || null, fix_plan: existingPlan, fix_plan_status: 'approved_for_pr', fix_plan_approved: true, fix_plan_approved_at: now, implementation_status: 'awaiting_github_pr_preparation', updated_at: now }).eq('id', body.remediationId); if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 }); return NextResponse.json({ ok: true }) } const { error } = await admin.from('remediation_requests').update({ status, human_approved: false, approved_by: null, approved_at: null, approval_notes: String(body.approvalNotes || '').trim() || null, fix_plan_status: status === 'rejected' ? 'rejected' : undefined, fix_plan_approved: false, updated_at: now }).eq('id', body.remediationId); if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 }); return NextResponse.json({ ok: true }) } return NextResponse.json({ ok: false, error: 'No alertId, monitorId, or remediationId supplied.' }, { status: 400 }) } catch (err) { const message = err instanceof Error ? err.message : 'Update failed.'; return NextResponse.json({ ok: false, error: message }, { status: 500 }) }
}
