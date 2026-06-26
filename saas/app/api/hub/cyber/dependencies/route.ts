// saas/app/api/hub/cyber/dependencies/route.ts
// Cybersecurity Center: manual dependency scans + monitor configuration + alert inbox
// + remediation requests where the fix plan is prepared before human approval.
// No fixes, commits, PRs, or merges are performed automatically.

import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/access'
import { getAdminSupabase } from '@/utils/supabase/server'
import { scanDependencyAdvisories } from '@/lib/cyber/dependencyScanner'
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
  return {
    en: {
      title: (repo: string) => `Fix plan for ${repo}`,
      summary: (count: number) => `SignalBoost prepared a remediation plan for ${count} detected dependency advisory finding(s). This is a plan only; no code has been changed and no pull request has been opened.`,
      updateAction: (target: string) => `Update this dependency to ${target}, regenerate the lockfile, and run the build/test suite before deployment.`,
      confirmAction: 'Confirm the patched compatible version, update this dependency, regenerate the lockfile, and run the build/test suite before deployment.',
      validation: ['Confirm the recommended patched version for each affected package.', 'Update package.json and the lockfile in a dedicated branch.', 'Run npm install or the project package-manager equivalent.', 'Run npm run build and the available test/lint commands.', 'Review the diff manually before opening or merging a pull request.'],
      safety: ['The fix plan is shown before the first human approval.', 'Approving this plan does not automatically edit code, commit changes, open a pull request, or merge anything.', 'Creating a PR or assisted code change requires a separate product layer and explicit human authorization.'],
      nextStep: 'Review this plan. Approving it only authorizes SignalBoost to move the request toward PR preparation; it does not change code automatically.',
      requestTitle: (repo: string) => `Dependency remediation plan: ${repo}`,
      requestSummary: (count: number) => `SignalBoost prepared a proposed remediation plan for ${count} dependency advisory finding(s). Human approval is required before PR preparation or any code change.`,
    },
    es: {
      title: (repo: string) => `Plan de corrección para ${repo}`,
      summary: (count: number) => `SignalBoost preparó un plan de remediación para ${count} hallazgo(s) de avisos de dependencias. Es solo un plan; no se cambió código ni se abrió ningún pull request.`,
      updateAction: (target: string) => `Actualiza esta dependencia a ${target}, regenera el lockfile y ejecuta la compilación/pruebas antes del despliegue.`,
      confirmAction: 'Confirma la versión compatible corregida, actualiza esta dependencia, regenera el lockfile y ejecuta la compilación/pruebas antes del despliegue.',
      validation: ['Confirma la versión corregida recomendada para cada paquete afectado.', 'Actualiza package.json y el lockfile en una rama dedicada.', 'Ejecuta npm install o el equivalente del gestor de paquetes del proyecto.', 'Ejecuta npm run build y los comandos de prueba/lint disponibles.', 'Revisa el diff manualmente antes de abrir o fusionar un pull request.'],
      safety: ['El plan se muestra antes de la primera aprobación humana.', 'Aprobar este plan no edita código, no hace commits, no abre pull requests ni fusiona nada automáticamente.', 'Crear un PR o cambio asistido requiere una capa de producto separada y autorización humana explícita.'],
      nextStep: 'Revisa este plan. Aprobarlo solo autoriza a SignalBoost a avanzar hacia la preparación del PR; no cambia el código automáticamente.',
      requestTitle: (repo: string) => `Plan de remediación de dependencias: ${repo}`,
      requestSummary: (count: number) => `SignalBoost preparó un plan propuesto para ${count} hallazgo(s) de avisos de dependencias. Se requiere aprobación humana antes de preparar un PR o cambiar código.`,
    },
    pt: {
      title: (repo: string) => `Plano de correção para ${repo}`,
      summary: (count: number) => `O SignalBoost preparou um plano de remediação para ${count} constatação(ões) de avisos de dependência. Isto é apenas um plano; nenhum código foi alterado e nenhum pull request foi aberto.`,
      updateAction: (target: string) => `Atualize esta dependência para ${target}, regenere o lockfile e execute a build/suíte de testes antes do deploy.`,
      confirmAction: 'Confirme a versão corrigida compatível, atualize esta dependência, regenere o lockfile e execute a build/suíte de testes antes do deploy.',
      validation: ['Confirme a versão corrigida recomendada para cada pacote afetado.', 'Atualize o package.json e o lockfile em um branch dedicado.', 'Execute npm install ou o equivalente do gerenciador de pacotes do projeto.', 'Execute npm run build e os comandos de teste/lint disponíveis.', 'Revise o diff manualmente antes de abrir ou mesclar um pull request.'],
      safety: ['O plano de correção é mostrado antes da primeira aprovação humana.', 'Aprovar este plano não edita código, não faz commit, não abre pull request e não mescla nada automaticamente.', 'Criar um PR ou mudança assistida exige uma camada de produto separada e autorização humana explícita.'],
      nextStep: 'Revise este plano. Aprovar apenas autoriza o SignalBoost a avançar para a preparação do PR; não altera código automaticamente.',
      requestTitle: (repo: string) => `Plano de remediação de dependências: ${repo}`,
      requestSummary: (count: number) => `O SignalBoost preparou um plano proposto para ${count} constatação(ões) de avisos de dependência. Aprovação humana é obrigatória antes da preparação de PR ou qualquer alteração de código.`,
    },
    pl: {
      title: (repo: string) => `Plan naprawczy dla ${repo}`,
      summary: (count: number) => `SignalBoost przygotował plan naprawczy dla ${count} wykrytych ostrzeżeń zależności. To tylko plan; kod nie został zmieniony i nie otwarto pull requesta.`,
      updateAction: (target: string) => `Zaktualizuj tę zależność do ${target}, wygeneruj ponownie lockfile i uruchom build/testy przed wdrożeniem.`,
      confirmAction: 'Potwierdź zgodną poprawioną wersję, zaktualizuj zależność, wygeneruj ponownie lockfile i uruchom build/testy przed wdrożeniem.',
      validation: ['Potwierdź zalecaną poprawioną wersję każdego dotkniętego pakietu.', 'Zaktualizuj package.json i lockfile w osobnej gałęzi.', 'Uruchom npm install albo odpowiednik menedżera pakietów projektu.', 'Uruchom npm run build oraz dostępne testy/lint.', 'Przejrzyj diff ręcznie przed otwarciem lub scaleniem pull requesta.'],
      safety: ['Plan jest pokazany przed pierwszą ludzką akceptacją.', 'Akceptacja planu nie edytuje kodu, nie tworzy commitów, nie otwiera pull requestów i niczego nie scala automatycznie.', 'Utworzenie PR lub asystowanej zmiany wymaga osobnej warstwy produktu i jawnej autoryzacji człowieka.'],
      nextStep: 'Przejrzyj ten plan. Akceptacja tylko pozwala SignalBoost przejść do przygotowania PR; kod nie zmienia się automatycznie.',
      requestTitle: (repo: string) => `Plan naprawy zależności: ${repo}`,
      requestSummary: (count: number) => `SignalBoost przygotował proponowany plan dla ${count} ostrzeżeń zależności. Przed przygotowaniem PR lub zmianą kodu wymagana jest akceptacja człowieka.`,
    },
    ru: {
      title: (repo: string) => `План исправления для ${repo}`,
      summary: (count: number) => `SignalBoost подготовил план исправления для ${count} обнаруженных предупреждений по зависимостям. Это только план; код не изменён и pull request не открыт.`,
      updateAction: (target: string) => `Обновите эту зависимость до ${target}, пересоздайте lockfile и запустите сборку/тесты перед деплоем.`,
      confirmAction: 'Подтвердите совместимую исправленную версию, обновите зависимость, пересоздайте lockfile и запустите сборку/тесты перед деплоем.',
      validation: ['Подтвердите рекомендуемую исправленную версию для каждого затронутого пакета.', 'Обновите package.json и lockfile в отдельной ветке.', 'Запустите npm install или эквивалентный менеджер пакетов проекта.', 'Запустите npm run build и доступные команды test/lint.', 'Вручную проверьте diff перед открытием или слиянием pull request.'],
      safety: ['План показывается до первого человеческого утверждения.', 'Утверждение плана не редактирует код, не создаёт коммиты, не открывает pull request и ничего не сливает автоматически.', 'Создание PR или ассистированного изменения требует отдельного продуктового слоя и явного разрешения человека.'],
      nextStep: 'Проверьте этот план. Утверждение только разрешает SignalBoost перейти к подготовке PR; код не меняется автоматически.',
      requestTitle: (repo: string) => `План исправления зависимостей: ${repo}`,
      requestSummary: (count: number) => `SignalBoost подготовил предложенный план для ${count} предупреждений по зависимостям. Перед подготовкой PR или изменением кода требуется человеческое утверждение.`,
    },
  }[lang]
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

async function prepareFixPlan(admin: any, remediationId: string, lang: ReportLang) { const { data: row, error } = await admin.from('remediation_requests').select('id,repo,target,findings,severity_summary,status,human_approved').eq('id', remediationId).single(); if (error || !row) return { ok: false, error: error?.message || 'Remediation request not found.' }; const plan = buildFixPlan(row, lang); const now = new Date().toISOString(); const update = await admin.from('remediation_requests').update({ fix_plan: plan, fix_plan_status: 'ready_for_review', fix_plan_created_at: now, implementation_status: 'not_started', updated_at: now }).eq('id', remediationId).select('id,fix_plan,fix_plan_status,fix_plan_created_at').single(); if (update.error) return { ok: false, error: update.error.message }; return { ok: true, remediationRequest: update.data } }

export async function GET() { const guard = await requireAdmin(); if (!guard.ok) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status }); try { return NextResponse.json({ ok: true, ...(await loadDashboardData()) }) } catch { return NextResponse.json({ ok: true, scans: [], monitors: [], alerts: [], remediationRequests: [] }) } }

export async function POST(req: Request) {
  const guard = await requireAdmin(); if (!guard.ok) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status }); const userId = userIdFromGuard(guard)
  let body: { action?: string; url?: string; label?: string; frequency?: string; maxPackages?: number; scanId?: string | null; report?: any; notes?: string; remediationId?: string; lang?: string } = {}
  try { body = await req.json() } catch { /* defaults */ }
  const lang = langFromRequest(req, body)

  if (body.action === 'create_monitor') { const repoUrl = String(body.url || '').trim(); if (!repoUrl) return NextResponse.json({ ok: false, error: 'Repository URL is required.' }, { status: 400 }); try { const admin = getAdminSupabase(); const { data, error } = await admin.from('cyber_monitored_repositories').insert({ user_id: userId, label: String(body.label || '').trim() || null, repo_url: repoUrl, frequency: safeFrequency(body.frequency), is_enabled: true }).select('id,label,repo_url,frequency,is_enabled,created_at').single(); if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 }); return NextResponse.json({ ok: true, monitor: data }) } catch (err) { const message = err instanceof Error ? err.message : 'Could not create monitor.'; return NextResponse.json({ ok: false, error: message }, { status: 500 }) } }
  if (body.action === 'prepare_fix_plan') { if (!body.remediationId) return NextResponse.json({ ok: false, error: 'remediationId is required.' }, { status: 400 }); const result = await prepareFixPlan(getAdminSupabase(), body.remediationId, lang); return NextResponse.json(result, { status: result.ok ? 200 : 400 }) }
  if (body.action === 'request_remediation') { const report = body.report || {}; const findings = remediationFindings(report); if (findings.length === 0) return NextResponse.json({ ok: false, error: 'No detected findings were supplied for remediation.' }, { status: 400 }); try { const summary = summarizeReport(report); const repo = report.repo || report.target || null; const target = report.target || null; const copy = cyberPlanCopy(lang); const repoLabel = repo || 'repository'; const plan = buildFixPlan({ repo, target, findings, severity_summary: summary }, lang); const now = new Date().toISOString(); const admin = getAdminSupabase(); const { data, error } = await admin.from('remediation_requests').insert({ user_id: userId, source_area: 'cybersecurity', source_type: 'dependency_scan', source_id: body.scanId || null, repo, target, title: copy.requestTitle(repoLabel), summary: copy.requestSummary(summary.advisories), severity_summary: summary, findings, status: 'awaiting_human_review', human_approval_required: true, human_approved: false, approval_notes: String(body.notes || '').trim() || null, fix_plan: plan, fix_plan_status: 'ready_for_review', fix_plan_created_at: now, fix_plan_approved: false, implementation_status: 'not_started' }).select('id,title,status,fix_plan,fix_plan_status,created_at').single(); if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 }); return NextResponse.json({ ok: true, remediationRequest: data }) } catch (err) { const message = err instanceof Error ? err.message : 'Could not create remediation plan.'; return NextResponse.json({ ok: false, error: message }, { status: 500 }) } }
  const report = await scanDependencyAdvisories({ url: body.url, maxPackages: body.maxPackages }); const stored = await storeScan(report, userId); const alertsCreated = await createAlertsForReport({ report, userId, scanId: stored.id }); return NextResponse.json({ ok: report.ok, report, scanId: stored.id, alertsCreated, error: report.error })
}

export async function PATCH(req: Request) {
  const guard = await requireAdmin(); if (!guard.ok) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status }); const userId = userIdFromGuard(guard)
  let body: { alertId?: string; monitorId?: string; remediationId?: string; status?: string; isEnabled?: boolean; approvalNotes?: string; planAction?: string; lang?: string } = {}; try { body = await req.json() } catch { /* defaults */ }
  const lang = langFromRequest(req, body)
  try { const admin = getAdminSupabase(); if (body.alertId) { const status = ['open', 'resolved', 'ignored'].includes(String(body.status)) ? String(body.status) : 'resolved'; const { error } = await admin.from('cyber_alerts').update({ status, resolved_at: status === 'open' ? null : new Date().toISOString() }).eq('id', body.alertId); if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 }); return NextResponse.json({ ok: true }) } if (body.monitorId) { const { error } = await admin.from('cyber_monitored_repositories').update({ is_enabled: !!body.isEnabled, updated_at: new Date().toISOString() }).eq('id', body.monitorId); if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 }); return NextResponse.json({ ok: true }) } if (body.remediationId && body.planAction === 'approve_fix_plan') { const now = new Date().toISOString(); const { error } = await admin.from('remediation_requests').update({ status: 'approved', human_approved: true, approved_by: userId, approved_at: now, fix_plan_status: 'approved_for_pr', fix_plan_approved: true, fix_plan_approved_at: now, implementation_status: 'awaiting_github_pr_preparation', updated_at: now }).eq('id', body.remediationId); if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 }); return NextResponse.json({ ok: true }) } if (body.remediationId) { const status = ['awaiting_human_review', 'approved', 'rejected', 'in_progress', 'completed', 'cancelled'].includes(String(body.status)) ? String(body.status) : 'awaiting_human_review'; const now = new Date().toISOString(); if (status === 'approved') { const row = await admin.from('remediation_requests').select('id,repo,target,findings,severity_summary,fix_plan').eq('id', body.remediationId).single(); const existingPlan = row.data?.fix_plan && Object.keys(row.data.fix_plan).length > 0 ? row.data.fix_plan : buildFixPlan(row.data, lang); const { error } = await admin.from('remediation_requests').update({ status: 'approved', human_approved: true, approved_by: userId, approved_at: now, approval_notes: String(body.approvalNotes || '').trim() || null, fix_plan: existingPlan, fix_plan_status: 'approved_for_pr', fix_plan_approved: true, fix_plan_approved_at: now, implementation_status: 'awaiting_github_pr_preparation', updated_at: now }).eq('id', body.remediationId); if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 }); return NextResponse.json({ ok: true }) } const { error } = await admin.from('remediation_requests').update({ status, human_approved: false, approved_by: null, approved_at: null, approval_notes: String(body.approvalNotes || '').trim() || null, fix_plan_status: status === 'rejected' ? 'rejected' : undefined, fix_plan_approved: false, updated_at: now }).eq('id', body.remediationId); if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 }); return NextResponse.json({ ok: true }) } return NextResponse.json({ ok: false, error: 'No alertId, monitorId, or remediationId supplied.' }, { status: 400 }) } catch (err) { const message = err instanceof Error ? err.message : 'Update failed.'; return NextResponse.json({ ok: false, error: message }, { status: 500 }) }
}
