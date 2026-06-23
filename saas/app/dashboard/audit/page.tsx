'use client'

// saas/app/dashboard/audit/page.tsx
// Unified Audit Center — single centralized workspace at /dashboard/audit.
//   • Top: Audit Command Center (scan-path + max-files + Run audit), live tracker,
//     findings list, and run history.
//   • Bottom: the 12 compliance report cards in a responsive grid; clicking a card
//     opens a 520px right-side drawer that renders that report.
// Linear-style design tokens (bg-surface / border-border / bg-accent / text-text …),
// 5-locale i18n via useI18n + useTranslation. Owner/admin sees live report data;
// non-admins get an owner-scoped upgrade panel (reports read the workspace's own
// infrastructure and are admin-gated server-side).

import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'
import { useTranslation } from '@/components/i18n/useTranslation'
import PatchPreview from '@/components/audit/PatchPreview'
import RemediationBanner from '@/components/audit/RemediationBanner'

// The 12 live report views, mounted directly (NOT iframed) so they render inside
// the drawer without the global app shell/navbar. Each is code-split via lazy().
const REPORT_VIEWS: Record<string, ReturnType<typeof lazy>> = {
  executive:   lazy(() => import('@/app/hub/audit/executive/page')),
  providers:   lazy(() => import('@/app/hub/audit/providers/page')),
  secrets:     lazy(() => import('@/app/hub/audit/secrets/page')),
  identity:    lazy(() => import('@/app/hub/audit/identity/page')),
  github:      lazy(() => import('@/app/hub/audit/github/page')),
  vercel:      lazy(() => import('@/app/hub/audit/vercel/page')),
  supabase:    lazy(() => import('@/app/hub/audit/supabase/page')),
  stripe:      lazy(() => import('@/app/hub/audit/stripe/page')),
  activity:    lazy(() => import('@/app/hub/audit/activity/page')),
  compliance:  lazy(() => import('@/app/hub/audit/compliance/page')),
  remediation: lazy(() => import('@/app/hub/audit/remediation/page')),
  usage:       lazy(() => import('@/app/hub/audit/usage/page')),
}

type Finding = {
  file: string
  severity: string
  category: string
  title: string
  detail: string
  recommendation: string
  line?: number | null
}
type RunSummary = {
  id: string
  created_at: string
  status: string
  prefix: string | null
  files_scanned: number
  findings_count: number
}
type View = { findings: Finding[]; filesScanned: number; findingsCount: number; prefix?: string; status?: string }

type Sev = 'critical' | 'high' | 'medium' | 'low' | 'info'
type AuditCopy = {
  title: string; subtitle: string; viewPlans: string
  pathLabel: string; maxLabel: string; run: string; running: string
  filesScanned: string; findings: string; clean: string; emptyHint: string
  ownerOnly: string; failed: string; quotaExceeded: string; category: string; recommendation: string; line: string
  history: string; noRuns: string; refresh: string
  statusRunning: string; statusComplete: string; statusFailed: string
  detail: string; close: string; viewSource: string
  generateFix: string; patching: string; patchReady: string; reviewMerge: string; patchFailed: string; patchUpgrade: string
  trackScan: string; trackAnalyze: string; trackReport: string; trackPrs: string
  cmdTitle: string; reportsTitle: string; reportsSubtitle: string; openReport: string; reportOwnerOnly: string; reportSyncHint: string; runningHint: string; pathHint: string; mvpBadge: string; viewOnline: string
  sev: Record<Sev, string>
}

const COPY: Record<string, AuditCopy> = {
  en: {
    title: 'Audit Console', subtitle: 'Deep security & quality scans, isolated from live console traffic.',
    viewPlans: 'View plans',
    pathLabel: 'Repository URL', maxLabel: 'Max files', run: 'Run audit', running: 'Running deep scan…',
    filesScanned: 'Files scanned', findings: 'Findings', clean: 'No findings — this scan came back clean.',
    emptyHint: 'Set a path and run a scan, or pick a past run.',
    ownerOnly: 'Owner access is required to run audits.', failed: 'Audit failed', quotaExceeded: 'Monthly limit reached: {used}/{cap} scans used. Upgrade your plan to run more.',
    category: 'Category', recommendation: 'Recommendation', line: 'Line',
    history: 'Run history', noRuns: 'No runs yet.', refresh: 'Refresh',
    statusRunning: 'Running', statusComplete: 'Complete', statusFailed: 'Failed',
    detail: 'Detail', close: 'Close', viewSource: 'View on GitHub',
    generateFix: 'Generate fix', patching: 'Generating fix…', patchReady: 'Fix proposed on a branch', reviewMerge: 'Review & merge', patchFailed: 'Could not generate fix', patchUpgrade: 'AI patch generation is a Pro feature. Upgrade to enable it.',
    trackScan: 'Scanning target', trackAnalyze: 'Running analyzers', trackReport: 'Generating report', trackPrs: 'Preparing patches',
    cmdTitle: 'Audit Command Center', reportsTitle: 'Compliance & Readiness Reports',
    reportsSubtitle: 'Twelve readiness reports across identity, providers, secrets, code, billing, and remediation.',
    openReport: 'View', reportOwnerOnly: 'These readiness reports are scoped to the workspace owner. Upgrade your plan to generate reports for your own connected stack.',
    reportSyncHint: 'Synced with your latest scan.',
    mvpBadge: 'MVP', viewOnline: 'View online',
    runningHint: 'Large scopes can take a few minutes — this stays live, keep the tab open.', pathHint: 'Paste a public GitHub repo URL, e.g. https://github.com/owner/repo',
    sev: { critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low', info: 'Info' },
  },
  es: {
    title: 'Consola de Auditoría', subtitle: 'Análisis profundos de seguridad y calidad, aislados del tráfico de la consola en vivo.',
    viewPlans: 'Ver planes',
    pathLabel: 'URL del repositorio', maxLabel: 'Archivos máx.', run: 'Ejecutar auditoría', running: 'Ejecutando análisis profundo…',
    filesScanned: 'Archivos analizados', findings: 'Hallazgos', clean: 'Sin hallazgos: este análisis salió limpio.',
    emptyHint: 'Define una ruta y ejecuta un análisis, o elige una ejecución anterior.',
    ownerOnly: 'Se requiere acceso de propietario para ejecutar auditorías.', failed: 'La auditoría falló', quotaExceeded: 'Límite mensual alcanzado: {used}/{cap} análisis usados. Mejora tu plan para ejecutar más.',
    category: 'Categoría', recommendation: 'Recomendación', line: 'Línea',
    history: 'Historial', noRuns: 'Aún no hay ejecuciones.', refresh: 'Actualizar',
    statusRunning: 'En curso', statusComplete: 'Completado', statusFailed: 'Falló',
    detail: 'Detalle', close: 'Cerrar', viewSource: 'Ver en GitHub',
    generateFix: 'Generar corrección', patching: 'Generando corrección…', patchReady: 'Corrección propuesta en una rama', reviewMerge: 'Revisar y combinar', patchFailed: 'No se pudo generar la corrección', patchUpgrade: 'La generación de parches con IA es una función Pro. Mejora tu plan para habilitarla.',
    trackScan: 'Escaneando objetivo', trackAnalyze: 'Ejecutando analizadores', trackReport: 'Generando informe', trackPrs: 'Preparando parches',
    cmdTitle: 'Centro de Comando de Auditoría', reportsTitle: 'Informes de Cumplimiento y Preparación',
    reportsSubtitle: 'Doce informes de preparación sobre identidad, proveedores, secretos, código, facturación y remediación.',
    openReport: 'Ver', reportOwnerOnly: 'Estos informes están limitados al propietario del espacio de trabajo. Mejora tu plan para generar informes de tu propio stack conectado.',
    reportSyncHint: 'Sincronizado con tu último análisis.',
    mvpBadge: 'MVP', viewOnline: 'Ver en línea',
    runningHint: 'Los análisis amplios pueden tardar unos minutos: sigue activo, deja la pestaña abierta.', pathHint: 'Pega la URL de un repo público de GitHub, p. ej. https://github.com/owner/repo',
    sev: { critical: 'Crítico', high: 'Alto', medium: 'Medio', low: 'Bajo', info: 'Info' },
  },
  pt: {
    title: 'Console de Auditoria', subtitle: 'Análises profundas de segurança e qualidade, isoladas do tráfego do console ao vivo.',
    viewPlans: 'Ver planos',
    pathLabel: 'URL do repositório', maxLabel: 'Máx. de arquivos', run: 'Executar auditoria', running: 'Executando análise profunda…',
    filesScanned: 'Arquivos analisados', findings: 'Constatações', clean: 'Nenhuma constatação — esta análise voltou limpa.',
    emptyHint: 'Defina um caminho e execute uma análise, ou escolha uma execução anterior.',
    ownerOnly: 'É necessário acesso de proprietário para executar auditorias.', failed: 'A auditoria falhou', quotaExceeded: 'Limite mensal atingido: {used}/{cap} análises usadas. Faça upgrade do seu plano para executar mais.',
    category: 'Categoria', recommendation: 'Recomendação', line: 'Linha',
    history: 'Histórico', noRuns: 'Ainda não há execuções.', refresh: 'Atualizar',
    statusRunning: 'Em execução', statusComplete: 'Concluído', statusFailed: 'Falhou',
    detail: 'Detalhe', close: 'Fechar', viewSource: 'Ver no GitHub',
    generateFix: 'Gerar correção', patching: 'Gerando correção…', patchReady: 'Correção proposta em um branch', reviewMerge: 'Revisar e mesclar', patchFailed: 'Não foi possível gerar a correção', patchUpgrade: 'A geração de correções com IA é um recurso Pro. Faça upgrade para habilitá-la.',
    trackScan: 'Verificando alvo', trackAnalyze: 'Executando analisadores', trackReport: 'Gerando relatório', trackPrs: 'Preparando correções',
    cmdTitle: 'Central de Comando de Auditoria', reportsTitle: 'Relatórios de Conformidade e Prontidão',
    reportsSubtitle: 'Doze relatórios de prontidão sobre identidade, provedores, segredos, código, faturamento e remediação.',
    openReport: 'Ver', reportOwnerOnly: 'Estes relatórios são restritos ao proprietário do espaço de trabalho. Faça upgrade do seu plano para gerar relatórios do seu próprio stack conectado.',
    reportSyncHint: 'Sincronizado com sua última análise.',
    mvpBadge: 'MVP', viewOnline: 'Ver online',
    runningHint: 'Escopos grandes podem levar alguns minutos — continua ativo, mantenha a aba aberta.', pathHint: 'Cole a URL de um repo público do GitHub, ex. https://github.com/owner/repo',
    sev: { critical: 'Crítico', high: 'Alto', medium: 'Médio', low: 'Baixo', info: 'Info' },
  },
  pl: {
    title: 'Konsola Audytu', subtitle: 'Dogłębne skany bezpieczeństwa i jakości, odizolowane od ruchu konsoli na żywo.',
    viewPlans: 'Zobacz plany',
    pathLabel: 'URL repozytorium', maxLabel: 'Maks. plików', run: 'Uruchom audyt', running: 'Trwa dogłębne skanowanie…',
    filesScanned: 'Przeskanowane pliki', findings: 'Wyniki', clean: 'Brak wyników — ten skan jest czysty.',
    emptyHint: 'Ustaw ścieżkę i uruchom skan lub wybierz wcześniejsze uruchomienie.',
    ownerOnly: 'Do uruchamiania audytów wymagany jest dostęp właściciela.', failed: 'Audyt nie powiódł się', quotaExceeded: 'Osiągnięto miesięczny limit: wykorzystano {used}/{cap} skanów. Ulepsz plan, aby uruchomić więcej.',
    category: 'Kategoria', recommendation: 'Zalecenie', line: 'Wiersz',
    history: 'Historia', noRuns: 'Brak uruchomień.', refresh: 'Odśwież',
    statusRunning: 'W toku', statusComplete: 'Zakończono', statusFailed: 'Niepowodzenie',
    detail: 'Szczegóły', close: 'Zamknij', viewSource: 'Zobacz na GitHub',
    generateFix: 'Wygeneruj poprawkę', patching: 'Generowanie poprawki…', patchReady: 'Poprawka zaproponowana w gałęzi', reviewMerge: 'Przejrzyj i scal', patchFailed: 'Nie udało się wygenerować poprawki', patchUpgrade: 'Generowanie poprawek AI to funkcja Pro. Ulepsz plan, aby ją włączyć.',
    trackScan: 'Skanowanie celu', trackAnalyze: 'Uruchamianie analizatorów', trackReport: 'Generowanie raportu', trackPrs: 'Przygotowywanie poprawek',
    cmdTitle: 'Centrum Dowodzenia Audytu', reportsTitle: 'Raporty Zgodności i Gotowości',
    reportsSubtitle: 'Dwanaście raportów gotowości obejmujących tożsamość, dostawców, sekrety, kod, płatności i naprawę.',
    openReport: 'Otwórz', reportOwnerOnly: 'Te raporty są dostępne tylko dla właściciela przestrzeni roboczej. Ulepsz plan, aby generować raporty dla własnego połączonego stosu.',
    reportSyncHint: 'Zsynchronizowano z najnowszym skanem.',
    mvpBadge: 'MVP', viewOnline: 'Zobacz online',
    runningHint: 'Duże zakresy mogą potrwać kilka minut — działa dalej, zostaw kartę otwartą.', pathHint: 'Wklej URL publicznego repozytorium GitHub, np. https://github.com/owner/repo',
    sev: { critical: 'Krytyczny', high: 'Wysoki', medium: 'Średni', low: 'Niski', info: 'Info' },
  },
  ru: {
    title: 'Консоль аудита', subtitle: 'Глубокие проверки безопасности и качества, изолированные от живого трафика консоли.',
    viewPlans: 'Посмотреть планы',
    pathLabel: 'URL репозитория', maxLabel: 'Макс. файлов', run: 'Запустить аудит', running: 'Выполняется глубокое сканирование…',
    filesScanned: 'Просканировано файлов', findings: 'Замечания', clean: 'Замечаний нет — сканирование чистое.',
    emptyHint: 'Укажите путь и запустите сканирование или выберите прошлый запуск.',
    ownerOnly: 'Для запуска аудита требуется доступ владельца.', failed: 'Аудит не выполнен', quotaExceeded: 'Достигнут месячный лимит: использовано {used}/{cap} проверок. Обновите план, чтобы запускать больше.',
    category: 'Категория', recommendation: 'Рекомендация', line: 'Строка',
    history: 'История запусков', noRuns: 'Запусков пока нет.', refresh: 'Обновить',
    statusRunning: 'Выполняется', statusComplete: 'Завершено', statusFailed: 'Ошибка',
    detail: 'Подробности', close: 'Закрыть', viewSource: 'Открыть на GitHub',
    generateFix: 'Сгенерировать исправление', patching: 'Создание исправления…', patchReady: 'Исправление предложено в ветке', reviewMerge: 'Просмотреть и слить', patchFailed: 'Не удалось создать исправление', patchUpgrade: 'Генерация исправлений ИИ — функция Pro. Обновите план, чтобы включить её.',
    trackScan: 'Сканирование цели', trackAnalyze: 'Запуск анализаторов', trackReport: 'Создание отчёта', trackPrs: 'Подготовка исправлений',
    cmdTitle: 'Командный центр аудита', reportsTitle: 'Отчёты о соответствии и готовности',
    reportsSubtitle: 'Двенадцать отчётов о готовности по идентификации, провайдерам, секретам, коду, биллингу и устранению.',
    openReport: 'Открыть', reportOwnerOnly: 'Эти отчёты доступны только владельцу рабочей области. Обновите план, чтобы создавать отчёты для своего подключённого стека.',
    reportSyncHint: 'Синхронизировано с последним сканированием.',
    mvpBadge: 'MVP', viewOnline: 'Открыть онлайн',
    runningHint: 'Большие области могут занять несколько минут — процесс активен, не закрывайте вкладку.', pathHint: 'Вставьте URL публичного репозитория GitHub, напр. https://github.com/owner/repo',
    sev: { critical: 'Критический', high: 'Высокий', medium: 'Средний', low: 'Низкий', info: 'Инфо' },
  },
}
function copyFor(lang: string): AuditCopy { return COPY[lang] || COPY.en }

// The 12 compliance reports. `key` maps to the live report page at /hub/audit/<key>.
type ReportCard = { key: string; icon: string; title: string; desc: string; mvp?: boolean }
const REPORTS: ReportCard[] = [
  { key: 'executive',   icon: '📑', title: 'Executive Risk Summary',      desc: 'Synthesized markdown brief: posture, top risks, and the bottom line.', mvp: true },
  { key: 'providers',   icon: '📦', title: 'Provider Inventory',          desc: 'Stripe, Vercel, Supabase, and GitHub connection status & risk.', mvp: true },
  { key: 'identity',    icon: '👤', title: 'Identity & Access Review',     desc: 'User access controls, owner rights, stale accounts, and MFA gaps.', mvp: true },
  { key: 'secrets',     icon: '🔑', title: 'Secrets & API Key Exposure',   desc: 'Hardcoded credentials, token rotation age, and exposure risk.', mvp: true },
  { key: 'remediation', icon: '🛠️', title: 'Remediation Roadmap',         desc: 'The actionable fix engine: prioritized fixes, owners, due dates.', mvp: true },
  { key: 'github',      icon: '🐙', title: 'GitHub / Code Change Report',  desc: 'Branch protection, open PRs, stale branches, unreviewed changes.' },
  { key: 'vercel',      icon: '▲',  title: 'Vercel / Env Var Report',      desc: 'Env vars, exposed variables, deployment and rollback status.' },
  { key: 'supabase',    icon: '🗄️', title: 'Supabase / Database Security', desc: 'RLS coverage, public tables, storage buckets, service-role use.' },
  { key: 'stripe',      icon: '💳', title: 'Stripe / Billing Configuration', desc: 'Products, prices, webhooks, and live vs test mode consistency.' },
  { key: 'pr-cockpit',  icon: '🔀', title: 'PR Cockpit Approval Trail',    desc: 'Infrastructure change requests, approvals, and merge results.' },
  { key: 'compliance',  icon: '⚖️', title: 'Compliance Readiness Matrix',  desc: 'SOC 2 / ISO 27001 / NIST CSF / CIS readiness — no certification claims.' },
  { key: 'activity',    icon: '🧾', title: 'Audit Log Export',            desc: 'Activity timeline of actions, providers, risk, and results.' },
]

const SEV_ORDER: Sev[] = ['critical', 'high', 'medium', 'low', 'info']
function asSev(s: string): Sev {
  const k = String(s || 'info').toLowerCase() as Sev
  return SEV_ORDER.includes(k) ? k : 'info'
}
// Token-aligned severity colours.
function sevText(sev: Sev): string {
  if (sev === 'critical' || sev === 'high') return 'text-danger'
  if (sev === 'medium') return 'text-accent'
  return 'text-text-muted'
}
function statusText(s: string): string {
  if (s === 'running') return 'text-accent'
  if (s === 'failed') return 'text-danger'
  return 'text-[#34d399]'
}
function statusDot(s: string): string {
  if (s === 'running') return 'bg-accent'
  if (s === 'failed') return 'bg-danger'
  return 'bg-[#34d399]'
}
function statusLabel(copy: AuditCopy, s: string): string { return s === 'running' ? copy.statusRunning : s === 'failed' ? copy.statusFailed : copy.statusComplete }
function timeShort(iso: string, lang: string): string {
  try { return new Date(iso).toLocaleString(lang || undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) }
  catch { return '' }
}
function ghUrl(file: string, line?: number | null): string {
  const path = String(file || '').split('/').map(encodeURIComponent).join('/')
  return `https://github.com/SignalBoost/signalboost-live/blob/main/${path}${typeof line === 'number' ? `#L${line}` : ''}`
}

const PHASE_ORDER = ['SCAN_TARGET', 'RUN_ANALYZERS', 'GENERATE_REPORT', 'PREPARE_PRS'] as const

function fmtElapsed(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

function PhaseTracker({ phase, progress, copy }: { phase: string; progress: { done: number; total: number }; copy: AuditCopy }) {
  const labels: Record<string, string> = {
    SCAN_TARGET: copy.trackScan, RUN_ANALYZERS: copy.trackAnalyze, GENERATE_REPORT: copy.trackReport, PREPARE_PRS: copy.trackPrs,
  }
  const curIdx = phase === 'DONE' ? PHASE_ORDER.length : PHASE_ORDER.indexOf(phase as typeof PHASE_ORDER[number])
  return (
    <div className="mt-4 rounded-md border border-border bg-surface p-4">
      {PHASE_ORDER.map((p, i) => {
        const isDone = curIdx > i
        const active = curIdx === i
        const isAnalyze = p === 'RUN_ANALYZERS'
        const pct = isDone ? 100 : active ? (isAnalyze && progress.total > 0 ? Math.min(Math.round((progress.done / progress.total) * 100), 100) : 45) : 0
        const fill = isDone ? 'bg-[#34d399]' : active ? 'bg-accent' : 'bg-border'
        return (
          <div key={p} className={i < PHASE_ORDER.length - 1 ? 'mb-3' : ''}>
            <div className="mb-1.5 flex items-baseline justify-between">
              <span className={`text-xs font-semibold ${active ? 'text-text' : isDone ? 'text-text-muted' : 'text-text-muted/70'}`}>{labels[p]}</span>
              {isAnalyze && active && progress.total > 0 && (
                <span className="font-mono text-[11px] text-text-muted">{progress.done}/{progress.total}</span>
              )}
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-bg">
              <div className={`h-full rounded-full transition-all duration-300 ${fill}`} style={{ width: `${pct}%` }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default function AuditCenterPage() {
  const { lang } = useI18n()
  const { t } = useTranslation()
  const copy = copyFor(lang)

  const [prefix, setPrefix] = useState('')
  const [maxFiles, setMaxFiles] = useState(8)
  const [elapsed, setElapsed] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [runs, setRuns] = useState<RunSummary[]>([])
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)
  const [view, setView] = useState<View | null>(null)
  const [phase, setPhase] = useState<string | null>(null)
  const [progress, setProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 })

  const [isAdmin, setIsAdmin] = useState(false)

  // Report drawer
  const [openReportKey, setOpenReportKey] = useState<string | null>(null)
  const [reportEntered, setReportEntered] = useState(false)
  const [refreshTick, setRefreshTick] = useState(0)

  // Finding drawer + patch flow
  const [selectedFinding, setSelectedFinding] = useState<Finding | null>(null)
  const [entered, setEntered] = useState(false)

  useEffect(() => {
    let alive = true
    fetch('/api/credits', { cache: 'no-store', credentials: 'include' })
      .then(r => r.json()).then(d => { if (alive) setIsAdmin(!!d?.isAdmin) })
      .catch(() => { /* default: not admin */ })
    return () => { alive = false }
  }, [])

  useEffect(() => {
    if (selectedFinding) { const id = requestAnimationFrame(() => setEntered(true)); return () => cancelAnimationFrame(id) }
    setEntered(false)
  }, [selectedFinding])

  useEffect(() => {
    if (openReportKey) { const id = requestAnimationFrame(() => setReportEntered(true)); return () => cancelAnimationFrame(id) }
    setReportEntered(false)
  }, [openReportKey])

  const loadHistory = useCallback(async () => {
    try {
      const res = await fetch('/api/hub/operator/audit/runs', { credentials: 'include' })
      const data = await res.json().catch(() => null)
      if (res.ok && data?.ok) setRuns(data.runs || [])
    } catch { /* sidebar history is non-critical */ }
  }, [])

  useEffect(() => { loadHistory() }, [loadHistory])

  // Elapsed-time heartbeat so a long run never looks frozen.
  useEffect(() => {
    if (!loading) return
    setElapsed(0)
    const id = setInterval(() => setElapsed(e => e + 1), 1000)
    return () => clearInterval(id)
  }, [loading])

  async function runNew() {
    setLoading(true); setError(null); setView(null); setSelectedRunId(null)
    setPhase('SCAN_TARGET'); setProgress({ done: 0, total: 0 })
    try {
      const res = await fetch('/api/hub/operator/audit', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ url: prefix.trim(), maxFiles }),
      })
      if (res.status === 403) { setError(copy.ownerOnly); setPhase(null); return }
      if (res.status === 402) {
        const j = (await res.json().catch(() => null)) as { used?: number; cap?: number } | null
        setError(copy.quotaExceeded.replace('{used}', String(j?.used ?? '')).replace('{cap}', String(j?.cap ?? '')))
        setPhase(null); return
      }
      if (!res.body) { setError(copy.failed); setPhase(null); return }

      const reader = res.body.getReader()
      const dec = new TextDecoder()
      let buf = ''
      let final: View | null = null
      let finalRunId: string | null = null
      let sawError = false
      // Read NDJSON phase events line by line.
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += dec.decode(value, { stream: true })
        let nl: number
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1)
          if (!line) continue
          let evt: { phase?: string; done?: number; total?: number; error?: string; findings?: Finding[]; filesScanned?: string[]; findingsCount?: number; prefix?: string; runId?: string }
          try { evt = JSON.parse(line) } catch { continue }
          if (evt.phase === 'RUN_ANALYZERS') { setPhase('RUN_ANALYZERS'); setProgress({ done: evt.done || 0, total: evt.total || 0 }) }
          else if (evt.phase === 'SCAN_TARGET' || evt.phase === 'GENERATE_REPORT' || evt.phase === 'PREPARE_PRS') { setPhase(evt.phase) }
          else if (evt.phase === 'ERROR') { setError(evt.error || copy.failed); sawError = true }
          else if (evt.phase === 'DONE') {
            final = { findings: evt.findings || [], filesScanned: (evt.filesScanned || []).length, findingsCount: evt.findingsCount || 0, prefix: evt.prefix, status: 'complete' }
            finalRunId = evt.runId || null
          }
        }
      }
      if (final) {
        setView(final); setSelectedRunId(finalRunId); setPhase('DONE'); loadHistory()
        // Data sync: bump the refresh token so the 12 report cards/drawers reload fresh.
        setRefreshTick(x => x + 1)
      } else {
        setPhase(null)
        if (!sawError) setError(copy.failed)
      }
    } catch {
      setError(copy.failed); setPhase(null)
    } finally {
      setLoading(false)
    }
  }

  async function openRun(id: string) {
    setError(null); setSelectedRunId(id)
    try {
      const res = await fetch(`/api/hub/operator/audit/runs?runId=${encodeURIComponent(id)}`, { credentials: 'include' })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.ok) { setError(data?.error || copy.failed); return }
      const r = data.run
      const log = data.log as { findings?: Finding[]; filesScanned?: string[]; findingsCount?: number; prefix?: string } | null
      const findings = (log?.findings as Finding[]) || (data.findings as Finding[]) || []
      setView({
        findings,
        filesScanned: Array.isArray(log?.filesScanned) ? log!.filesScanned!.length : (r?.files_scanned || 0),
        findingsCount: typeof log?.findingsCount === 'number' ? log!.findingsCount! : (r?.findings_count || 0),
        prefix: log?.prefix ?? r?.prefix,
        status: r?.status,
      })
      setProgress({ done: 0, total: 0 })
      setPhase(r?.status === 'complete' ? 'DONE' : null)
    } catch {
      setError(copy.failed)
    }
  }

  const findings = view?.findings || []
  const openReport = openReportKey ? REPORTS.find(r => r.key === openReportKey) || null : null
  const closeReport = () => setOpenReportKey(null)
  const hasSynced = refreshTick > 0

  return (
    <main className="min-h-[calc(100vh-80px)] bg-bg px-6 pb-16 pt-8 font-sans text-text">
      <div className="mx-auto max-w-[1200px]">

        {/* Header */}
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-text">{copy.title}</h1>
            <p className="mt-1.5 max-w-[640px] text-sm leading-relaxed text-text-muted">{copy.subtitle}</p>
          </div>
          <a href="/dashboard/audit/pricing" className="inline-flex shrink-0 items-center justify-center rounded-md border border-accent bg-accent px-4 py-2 text-sm font-semibold text-bg transition-fast hover:brightness-110">
            {copy.viewPlans}
          </a>
        </div>

        {/* ── Audit Command Center (scan controller) ─────────────────────── */}
        <div className="mb-2 flex items-center gap-2">
          <span className="text-sm" aria-hidden>⚡</span>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-text-muted">{copy.cmdTitle}</h2>
        </div>
        <div className="rounded-md border border-border bg-surface p-4">
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex min-w-[200px] flex-[1_1_280px] flex-col gap-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">{copy.pathLabel}</span>
              <input
                value={prefix}
                onChange={e => setPrefix(e.target.value)}
                placeholder="https://github.com/owner/repo"
                className="rounded-md border border-border bg-bg px-3 py-2 text-sm text-text outline-none focus:border-accent"
              />
              <span className="text-[10.5px] leading-snug text-text-muted/80">{copy.pathHint}</span>
            </label>
            <label className="flex w-[120px] flex-col gap-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">{copy.maxLabel}</span>
              <input
                type="number" min={1} max={60} value={maxFiles}
                onChange={e => setMaxFiles(Math.max(1, Math.min(60, Number(e.target.value) || 1)))}
                className="rounded-md border border-border bg-bg px-3 py-2 text-sm text-text outline-none focus:border-accent"
              />
            </label>
            <button
              onClick={runNew}
              disabled={loading}
              className="inline-flex items-center justify-center whitespace-nowrap rounded-md border border-accent bg-accent px-5 py-2 text-sm font-semibold text-bg transition-fast hover:brightness-110 disabled:opacity-60"
            >
              {loading ? copy.running : copy.run}
            </button>
          </div>
        </div>

        {loading && (
          <div className="mt-4 rounded-md border border-accent/40 bg-surface p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="flex items-center gap-2 text-xs font-semibold text-text">
                <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-accent" />
                {copy.running}
              </span>
              <span className="font-mono text-[11px] tabular-nums text-text-muted">{fmtElapsed(elapsed)}</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-bg">
              <div className="h-full w-1/3 rounded-full bg-accent" style={{ animation: 'sbIndet 1.15s ease-in-out infinite' }} />
            </div>
            <p className="mt-2 text-[11.5px] leading-relaxed text-text-muted">{copy.runningHint}</p>
            <style>{`@keyframes sbIndet{0%{transform:translateX(-120%)}100%{transform:translateX(360%)}}`}</style>
          </div>
        )}

        {phase && <PhaseTracker phase={phase} progress={progress} copy={copy} />}

        {/* Ready to Remediate — appears the moment a scan completes with findings. */}
        {!loading && view && view.findingsCount > 0 && (phase === 'DONE' || view.status === 'complete') && (
          <RemediationBanner count={view.findingsCount} lang={lang} targetId="audit-findings" />
        )}

        {error && (
          <div className="mt-4 rounded-md border border-danger bg-surface p-3 text-sm text-danger">{copy.failed}: {error}</div>
        )}

        {/* Findings + history */}
        <div className="mt-4 flex flex-wrap items-start gap-4">
          {/* History */}
          <aside className="min-w-[240px] max-w-[300px] flex-[1_1_260px] rounded-md border border-border bg-surface p-3.5">
            <div className="mb-2.5 flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">{copy.history}</span>
              <button onClick={loadHistory} className="rounded-md border border-border bg-bg px-2.5 py-1 text-[11px] font-semibold text-text-muted transition-fast hover:bg-surface">{copy.refresh}</button>
            </div>
            {runs.length === 0 ? (
              <div className="px-0.5 py-2 text-xs text-text-muted">{copy.noRuns}</div>
            ) : (
              <div className="flex max-h-[calc(100vh-280px)] flex-col gap-1.5 overflow-y-auto">
{runs.map(r => {
                  const active = r.id === selectedRunId
                  return (
                    <button
                      key={r.id}
                      onClick={() => openRun(r.id)}
                      className={`rounded-md border px-2.5 py-2 text-left transition-fast ${active ? 'border-accent bg-bg' : 'border-border bg-bg hover:border-accent'}`}
                    >
                      <div className="flex items-center gap-2">
                        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${statusDot(r.status)}`} />
                        <span className={`text-[11px] font-semibold ${statusText(r.status)}`}>{statusLabel(copy, r.status)}</span>
                        <span className={`ml-auto text-[11px] font-bold ${r.findings_count > 0 ? 'text-accent' : 'text-text-muted'}`}>{r.findings_count}</span>
                      </div>
                      <div className="mt-1 truncate font-mono text-[10.5px] text-text-muted">{r.prefix || '—'}</div>
                      <div className="mt-0.5 text-[10px] text-text-muted/70">{timeShort(r.created_at, lang)}</div>
                    </button>
                  )
                })}
              </div>
            )}
          </aside>

          {/* Findings column */}
          <section id="audit-findings" className="min-w-[320px] flex-[999_1_420px] scroll-mt-6">
            {view ? (
              <>
                <div className="mb-3 flex flex-wrap gap-3">
                  <Stat label={copy.filesScanned} value={String(view.filesScanned)} accent="text-[#1af0ff]" />
                  <Stat label={copy.findings} value={String(view.findingsCount)} accent="text-accent" />
                </div>
                {findings.length === 0 ? (
                  <div className="rounded-md border border-border bg-surface p-4 text-sm text-text-muted">{copy.clean}</div>
                ) : (
                  <div className="max-h-[calc(100vh-380px)] overflow-y-auto rounded-md border border-border bg-surface p-1.5">
                    {findings.map((f, i) => {
                      const sev = asSev(f.severity)
                      return (
                        <div
                          key={i}
                          onClick={() => setSelectedFinding(f)}
                          className={`cursor-pointer p-3.5 ${i < findings.length - 1 ? 'border-b border-border' : ''}`}
                        >
                          <div className="flex flex-wrap items-center gap-2.5">
                            <span className={`rounded-full border border-border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${sevText(sev)}`}>{copy.sev[sev]}</span>
                            <span className="text-sm font-semibold text-text">{f.title}</span>
                          </div>
                          <div className="mt-1.5 font-mono text-[11px] text-text-muted">
                            {f.file}{typeof f.line === 'number' ? `  ·  ${copy.line} ${f.line}` : ''}  ·  {copy.category}: {f.category}
                          </div>
                          {f.detail && <p className="mt-2 text-[13px] leading-relaxed text-text">{f.detail}</p>}
                          {f.recommendation && (
                            <div className="mt-2 rounded-md border border-border bg-bg px-3 py-2">
                              <span className="text-[10px] font-semibold uppercase tracking-wide text-accent">{copy.recommendation}</span>
                              <p className="mt-1 text-[12.5px] leading-relaxed text-text-muted">{f.recommendation}</p>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </>
            ) : (
              !error && !loading && <div className="text-[12.5px] text-text-muted">{copy.emptyHint}</div>
            )}
          </section>
        </div>

        {/* ── Compliance & Readiness Reports (12-card grid) ──────────────── */}
        <div className="mt-10 mb-3 flex flex-wrap items-end justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-sm" aria-hidden>📊</span>
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-text-muted">{copy.reportsTitle}</h2>
              <p className="mt-0.5 max-w-[680px] text-[12.5px] leading-relaxed text-text-muted/80">{copy.reportsSubtitle}</p>
            </div>
          </div>
          {hasSynced && (
            <span className="rounded-full border border-border bg-surface px-2.5 py-1 text-[11px] font-medium text-[#34d399]">● {copy.reportSyncHint}</span>
          )}
        </div>

        <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3">
          {REPORTS.map((r, idx) => {
            const accent = idx % 2 === 0 ? 'text-accent' : 'text-[#1af0ff]'
            const isExec = r.key === 'executive'
            return (
              <button
                key={r.key}
                onClick={() => setOpenReportKey(r.key)}
                className={`flex flex-col gap-2 rounded-md border bg-surface p-4 text-left transition-fast hover:border-accent ${r.mvp ? 'border-accent ring-1 ring-accent/40' : 'border-border'}`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-lg" aria-hidden>{r.icon}</span>
                  <div className="flex items-center gap-1.5">
                    {r.mvp && <span className="rounded-full bg-accent px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-bg">{copy.mvpBadge}</span>}
                    {isExec && view && (
                      <span className="rounded-full border border-border bg-bg px-2 py-0.5 text-[10px] font-bold text-accent">
                        {view.findingsCount} {copy.findings}
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-sm font-semibold text-text">{t(`audit.center.${r.key}.title`, r.title)}</div>
                <div className="flex-1 text-[12px] leading-relaxed text-text-muted">{t(`audit.center.${r.key}.desc`, r.desc)}</div>
                <div className={`mt-1 text-[12px] font-semibold ${accent}`}>{copy.openReport} →</div>
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Report drawer (520px) ─────────────────────────────────────────── */}
      {openReport && (
        <div
          onClick={closeReport}
          className="fixed inset-0 z-[1000] flex justify-end transition-[background] duration-200"
          style={{ background: reportEntered ? 'rgba(2,3,6,.62)' : 'rgba(2,3,6,0)', backdropFilter: reportEntered ? 'blur(4px)' : 'none', WebkitBackdropFilter: reportEntered ? 'blur(4px)' : 'none' }}
        >
          <div
            onClick={e => e.stopPropagation()}
            className="fixed right-0 top-0 flex h-full w-[520px] max-w-full flex-col border-l border-border bg-surface p-6 transition-transform duration-300"
            style={{ transform: reportEntered ? 'translateX(0)' : 'translateX(100%)', boxShadow: '-20px 0 60px rgba(0,0,0,.5)' }}
          >
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="text-lg" aria-hidden>{openReport.icon}</span>
                <h2 className="text-base font-semibold text-text">{t(`audit.center.${openReport.key}.title`, openReport.title)}</h2>
              </div>
              <button onClick={closeReport} aria-label={copy.close} className="flex h-8 w-8 items-center justify-center rounded-md border border-border text-text-muted transition-fast hover:bg-bg">×</button>
            </div>

            <div className="mb-3 flex flex-wrap items-center gap-2 border-b border-border pb-3">
              <a
                href={openReport.key === 'pr-cockpit' ? '/hub' : `/hub/audit/${openReport.key}`}
                target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-bg px-3 py-1.5 text-[12px] font-semibold text-text transition-fast hover:border-accent"
              >
                ↗ {copy.viewOnline}
              </a>
            </div>

            {openReport.key === 'pr-cockpit' ? (
              <div className="flex min-h-0 flex-1 flex-col items-start justify-center gap-4 rounded-md border border-border bg-bg p-6">
                <span className="text-2xl" aria-hidden>🔀</span>
                <p className="text-sm leading-relaxed text-text-muted">{t('audit.center.prCockpitPending', 'The PR Cockpit approval trail — infrastructure change requests, approvals, and merge results — lives in the Hub PR Cockpit. A dedicated report view is being wired to that data.')}</p>
                <a href="/hub" className="inline-flex items-center justify-center rounded-md border border-accent bg-accent px-4 py-2 text-sm font-semibold text-bg transition-fast hover:brightness-110">{t('audit.center.openCockpit', 'Open PR Cockpit')}</a>
              </div>
            ) : isAdmin ? (
              <div className="min-h-0 flex-1 overflow-y-auto rounded-md border border-border bg-bg">
                {(() => {
                  const ReportView = REPORT_VIEWS[openReport.key]
                  return ReportView ? (
                    <Suspense fallback={<div className="p-6 text-sm text-text-muted">{t('audit.center.loading', 'Loading report…')}</div>}>
                      <ReportView key={refreshTick} />
                    </Suspense>
                  ) : null
                })()}
              </div>
            ) : (
              <div className="flex min-h-0 flex-1 flex-col items-start justify-center gap-4 rounded-md border border-border bg-bg p-6">
                <span className="text-2xl" aria-hidden>🔒</span>
                <p className="text-sm leading-relaxed text-text-muted">{copy.reportOwnerOnly}</p>
                <a href="/dashboard/audit/pricing" className="inline-flex items-center justify-center rounded-md border border-accent bg-accent px-4 py-2 text-sm font-semibold text-bg transition-fast hover:brightness-110">
                  {copy.viewPlans}
                </a>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Finding-detail drawer ─────────────────────────────────────────── */}
      {selectedFinding && (() => {
        const sev = asSev(selectedFinding.severity)
        return (
          <div
            onClick={() => setSelectedFinding(null)}
            className="fixed inset-0 z-[1000] flex justify-end transition-[background] duration-200"
            style={{ background: entered ? 'rgba(2,3,6,.62)' : 'rgba(2,3,6,0)', backdropFilter: entered ? 'blur(4px)' : 'none', WebkitBackdropFilter: entered ? 'blur(4px)' : 'none' }}
          >
            <div
              onClick={e => e.stopPropagation()}
              className="fixed right-0 top-0 h-full w-[480px] max-w-full overflow-y-auto border-l border-border bg-surface p-6 transition-transform duration-300"
              style={{ transform: entered ? 'translateX(0)' : 'translateX(100%)', boxShadow: '-20px 0 60px rgba(0,0,0,.5)' }}
            >
              <div className="flex items-center justify-between gap-3">
                <span className={`rounded-full border border-border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${sevText(sev)}`}>{copy.sev[sev]}</span>
                <button onClick={() => setSelectedFinding(null)} aria-label={copy.close} className="flex h-8 w-8 items-center justify-center rounded-md border border-border text-text-muted transition-fast hover:bg-bg">×</button>
              </div>

              <h2 className="mt-3.5 mb-1 text-lg font-semibold leading-snug text-text">{selectedFinding.title}</h2>
              <div className="break-all font-mono text-[11.5px] text-text-muted">
                {selectedFinding.file}{typeof selectedFinding.line === 'number' ? `  ·  ${copy.line} ${selectedFinding.line}` : ''}
              </div>
              <div className="mt-1.5 text-[11px] text-text-muted">{copy.category}: {selectedFinding.category}</div>

              {selectedFinding.detail && (
                <div className="mt-4">
                  <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-text-muted">{copy.detail}</div>
                  <p className="text-[13.5px] leading-relaxed text-text">{selectedFinding.detail}</p>
                </div>
              )}

              {selectedFinding.recommendation && (
                <div className="mt-4 rounded-md border border-border bg-bg px-3.5 py-3">
                  <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-accent">{copy.recommendation}</div>
                  <p className="text-[13px] leading-relaxed text-text-muted">{selectedFinding.recommendation}</p>
                </div>
              )}

              <a href={ghUrl(selectedFinding.file, selectedFinding.line)} target="_blank" rel="noopener noreferrer" className="mt-4 inline-block rounded-md border border-border px-3.5 py-2 text-[12.5px] font-semibold text-[#1af0ff] transition-fast hover:bg-bg">
                {copy.viewSource} ↗
              </a>

              {selectedFinding.recommendation && (
                <div className="mt-5 border-t border-border pt-4">
                  <PatchPreview finding={selectedFinding} />
                </div>
              )}
            </div>
          </div>
        )
      })()}
    </main>
  )
}

function Stat({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="min-w-[130px] rounded-md border border-border bg-surface px-4 py-3">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">{label}</div>
      <div className={`mt-0.5 text-2xl font-semibold leading-tight ${accent}`}>{value}</div>
    </div>
  )
}
