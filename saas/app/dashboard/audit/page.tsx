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
  cmdTitle: string; reportsTitle: string; reportsSubtitle: string; openReport: string; reportOwnerOnly: string; reportSyncHint: string
  sev: Record<Sev, string>
}

const COPY: Record<string, AuditCopy> = {
  en: {
    title: 'Audit Console', subtitle: 'Deep security & quality scans, isolated from live console traffic.',
    viewPlans: 'View plans',
    pathLabel: 'Scan path', maxLabel: 'Max files', run: 'Run audit', running: 'Running deep scan…',
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
    sev: { critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low', info: 'Info' },
  },
  es: {
    title: 'Consola de Auditoría', subtitle: 'Análisis profundos de seguridad y calidad, aislados del tráfico de la consola en vivo.',
    viewPlans: 'Ver planes',
    pathLabel: 'Ruta de análisis', maxLabel: 'Archivos máx.', run: 'Ejecutar auditoría', running: 'Ejecutando análisis profundo…',
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
    sev: { critical: 'Crítico', high: 'Alto', medium: 'Medio', low: 'Bajo', info: 'Info' },
  },
  pt: {
    title: 'Console de Auditoria', subtitle: 'Análises profundas de segurança e qualidade, isoladas do tráfego do console ao vivo.',
    viewPlans: 'Ver planos',
    pathLabel: 'Caminho de análise', maxLabel: 'Máx. de arquivos', run: 'Executar auditoria', running: 'Executando análise profunda…',
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
    sev: { critical: 'Crítico', high: 'Alto', medium: 'Médio', low: 'Baixo', info: 'Info' },
  },
  pl: {
    title: 'Konsola Audytu', subtitle: 'Dogłębne skany bezpieczeństwa i jakości, odizolowane od ruchu konsoli na żywo.',
    viewPlans: 'Zobacz plany',
    pathLabel: 'Ścieżka skanowania', maxLabel: 'Maks. plików', run: 'Uruchom audyt', running: 'Trwa dogłębne skanowanie…',
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
    sev: { critical: 'Krytyczny', high: 'Wysoki', medium: 'Średni', low: 'Niski', info: 'Info' },
  },
  ru: {
    title: 'Консоль аудита', subtitle: 'Глубокие проверки безопасности и качества, изолированные от живого трафика консоли.',
    viewPlans: 'Посмотреть планы',
    pathLabel: 'Путь сканирования', maxLabel: 'Макс. файлов', run: 'Запустить аудит', running: 'Выполняется глубокое сканирование…',
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
    sev: { critical: 'Критический', high: 'Высокий', medium: 'Средний', low: 'Низкий', info: 'Инфо' },
  },
}
function copyFor(lang: string): AuditCopy { return COPY[lang] || COPY.en }

// The 12 compliance reports. `key` maps to the live report page at /hub/audit/<key>.
type ReportCard = { key: string; icon: string; title: string; desc: string }
const REPORTS: ReportCard[] = [
  { key: 'executive',   icon: '📑', title: 'Executive Summary',    desc: 'Overall posture score with critical, high, and medium findings.' },
  { key: 'providers',   icon: '📦', title: 'Provider Inventory',   desc: 'Every connected provider with status, risk, and ownership.' },
  { key: 'secrets',     icon: '🔑', title: 'Secrets & API Keys',   desc: 'Tokens, rotation age, and exposure risk — values always masked.' },
  { key: 'identity',    icon: '👤', title: 'Identity & Access',    desc: 'Who has access, owner rights, stale accounts, and MFA gaps.' },
  { key: 'github',      icon: '🐙', title: 'GitHub / Code Change', desc: 'Branch protection, open PRs, stale branches, unreviewed changes.' },
  { key: 'vercel',      icon: '▲',  title: 'Vercel / Deployment',  desc: 'Env vars, exposed variables, deployment and rollback status.' },
  { key: 'supabase',    icon: '🗄️', title: 'Supabase / Database',  desc: 'RLS coverage, public tables, storage buckets, service-role use.' },
  { key: 'stripe',      icon: '💳', title: 'Stripe / Billing',     desc: 'Products, prices, webhooks, live vs test mode consistency.' },
  { key: 'activity',    icon: '🧾', title: 'Audit Log',            desc: 'Activity timeline of actions, providers, risk, and results.' },
  { key: 'compliance',  icon: '⚖️', title: 'Compliance Matrix',    desc: 'SOC 2 / ISO 27001 / NIST CSF / CIS readiness crosswalk.' },
  { key: 'remediation', icon: '🛠️', title: 'Remediation Roadmap',  desc: 'Prioritized fixes with owners, due dates, and evidence.' },
  { key: 'usage',       icon: '📊', title: 'Usage Tracking',       desc: 'Scan volume, credits, and tier utilization over time.' },
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

  const [prefix, setPrefix] = useState('saas/app/api')
  const [maxFiles, setMaxFiles] = useState(8)
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
  const [patchState, setPatchState] = useState<'idle' | 'working' | 'done' | 'error'>('idle')
  const [patchResult, setPatchResult] = useState<{ branch: string; compareUrl: string } | null>(null)
  const [patchError, setPatchError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    fetch('/api/credits', { cache: 'no-store', credentials: 'include' })
      .then(r => r.json()).then(d => { if (alive) setIsAdmin(!!d?.isAdmin) })
      .catch(() => { /* default: not admin */ })
    return () => { alive = false }
  }, [])

  useEffect(() => {
    setPatchState('idle'); setPatchResult(null); setPatchError(null)
    if (selectedFinding) { const id = requestAnimationFrame(() => setEntered(true)); return () => cancelAnimationFrame(id) }
    setEntered(false)
  }, [selectedFinding])

  useEffect(() => {
    if (openReportKey) { const id = requestAnimationFrame(() => setReportEntered(true)); return () => cancelAnimationFrame(id) }
    setReportEntered(false)
  }, [openReportKey])

  async function generateFix(f: Finding) {
    setPatchState('working'); setPatchError(null); setPatchResult(null)
    try {
      const res = await fetch('/api/hub/operator/audit/patch', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ file: f.file, line: typeof f.line === 'number' ? f.line : undefined, title: f.title, detail: f.detail, recommendation: f.recommendation }),
      })
      const data = await res.json().catch(() => null)
      if (res.status === 402 && data?.code === 'patch_not_in_plan') { setPatchError(copy.patchUpgrade); setPatchState('error'); return }
      if (!res.ok || !data?.ok) { setPatchError(data?.error || copy.patchFailed); setPatchState('error'); return }
      setPatchResult({ branch: data.branch, compareUrl: data.compareUrl }); setPatchState('done')
    } catch {
      setPatchError(copy.patchFailed); setPatchState('error')
    }
  }

  const loadHistory = useCallback(async () => {
    try {
      const res = await fetch('/api/hub/operator/audit/runs', { credentials: 'include' })
      const data = await res.json().catch(() => null)
      if (res.ok && data?.ok) setRuns(data.runs || [])
    } catch { /* sidebar history is non-critical */ }
  }, [])

  useEffect(() => { loadHistory() }, [loadHistory])

  async function runNew() {
    setLoading(true); setError(null); setView(null); setSelectedRunId(null)
    setPhase('SCAN_TARGET'); setProgress({ done: 0, total: 0 })
    try {
      const res = await fetch('/api/hub/operator/audit', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ prefix: prefix.trim() || 'saas/app/api', maxFiles }),
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
