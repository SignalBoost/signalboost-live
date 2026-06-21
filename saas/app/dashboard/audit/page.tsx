'use client'

// saas/app/dashboard/audit/page.tsx
// Audit Console — Steps 2+3: run trigger + run-history sidebar + browse past runs
// + finding-detail drawer (click a finding → right slide-in with detail,
// recommendation, source line, and a GitHub deep-link). Read-only.
// POST /api/hub/operator/audit (run), GET /api/hub/operator/audit/runs (history/detail).
// Fathom-glass aesthetic, 5-locale copy, height:auto + maxHeight scroll (no clipping).

import { useCallback, useEffect, useState } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'
import AuditDashboard from '@/components/audit/AuditDashboard'

const GOLD = '#ffc300'
const CYAN = '#1af0ff'
const GREEN = '#34d399'
const RED = '#fca5a5'

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
  generateFix: string; patching: string; patchReady: string; reviewMerge: string; patchFailed: string
  trackScan: string; trackAnalyze: string; trackReport: string; trackPrs: string
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
    generateFix: 'Generate fix', patching: 'Generating fix…', patchReady: 'Fix proposed on a branch', reviewMerge: 'Review & merge', patchFailed: 'Could not generate fix',
    trackScan: 'Scanning target', trackAnalyze: 'Running analyzers', trackReport: 'Generating report', trackPrs: 'Preparing patches',
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
    generateFix: 'Generar corrección', patching: 'Generando corrección…', patchReady: 'Corrección propuesta en una rama', reviewMerge: 'Revisar y combinar', patchFailed: 'No se pudo generar la corrección',
    trackScan: 'Escaneando objetivo', trackAnalyze: 'Ejecutando analizadores', trackReport: 'Generando informe', trackPrs: 'Preparando parches',
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
    generateFix: 'Gerar correção', patching: 'Gerando correção…', patchReady: 'Correção proposta em um branch', reviewMerge: 'Revisar e mesclar', patchFailed: 'Não foi possível gerar a correção',
    trackScan: 'Verificando alvo', trackAnalyze: 'Executando analisadores', trackReport: 'Gerando relatório', trackPrs: 'Preparando correções',
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
    generateFix: 'Wygeneruj poprawkę', patching: 'Generowanie poprawki…', patchReady: 'Poprawka zaproponowana w gałęzi', reviewMerge: 'Przejrzyj i scal', patchFailed: 'Nie udało się wygenerować poprawki',
    trackScan: 'Skanowanie celu', trackAnalyze: 'Uruchamianie analizatorów', trackReport: 'Generowanie raportu', trackPrs: 'Przygotowywanie poprawek',
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
    generateFix: 'Сгенерировать исправление', patching: 'Создание исправления…', patchReady: 'Исправление предложено в ветке', reviewMerge: 'Просмотреть и слить', patchFailed: 'Не удалось создать исправление',
    trackScan: 'Сканирование цели', trackAnalyze: 'Запуск анализаторов', trackReport: 'Создание отчёта', trackPrs: 'Подготовка исправлений',
    sev: { critical: 'Критический', high: 'Высокий', medium: 'Средний', low: 'Низкий', info: 'Инфо' },
  },
}
function copyFor(lang: string): AuditCopy { return COPY[lang] || COPY.en }

const SEV_ORDER: Sev[] = ['critical', 'high', 'medium', 'low', 'info']
const SEV_COLOR: Record<Sev, string> = { critical: RED, high: '#fb923c', medium: GOLD, low: CYAN, info: 'rgba(255,255,255,.6)' }
function asSev(s: string): Sev {
  const k = String(s || 'info').toLowerCase() as Sev
  return SEV_ORDER.includes(k) ? k : 'info'
}
function statusColor(s: string): string { return s === 'running' ? CYAN : s === 'failed' ? RED : GREEN }
function statusLabel(copy: AuditCopy, s: string): string { return s === 'running' ? copy.statusRunning : s === 'failed' ? copy.statusFailed : copy.statusComplete }
function timeShort(iso: string, lang: string): string {
  try { return new Date(iso).toLocaleString(lang || undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) }
  catch { return '' }
}
function ghUrl(file: string, line?: number | null): string {
  const path = String(file || '').split('/').map(encodeURIComponent).join('/')
  return `https://github.com/SignalBoost/signalboost-live/blob/main/${path}${typeof line === 'number' ? `#L${line}` : ''}`
}

const glass: React.CSSProperties = {
  background: 'linear-gradient(160deg, rgba(15,23,42,.55), rgba(7,11,20,.65))',
  border: '1px solid rgba(255,255,255,.10)', borderRadius: 16,
  backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)',
}
const input: React.CSSProperties = {
  background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.14)',
  color: '#fff', borderRadius: 10, padding: '9px 12px', fontSize: 13, outline: 'none',
}

const PHASE_ORDER = ['SCAN_TARGET', 'RUN_ANALYZERS', 'GENERATE_REPORT', 'PREPARE_PRS'] as const

function PhaseTracker({ phase, progress, copy }: { phase: string; progress: { done: number; total: number }; copy: AuditCopy }) {
  const labels: Record<string, string> = {
    SCAN_TARGET: copy.trackScan, RUN_ANALYZERS: copy.trackAnalyze, GENERATE_REPORT: copy.trackReport, PREPARE_PRS: copy.trackPrs,
  }
  const curIdx = phase === 'DONE' ? PHASE_ORDER.length : PHASE_ORDER.indexOf(phase as typeof PHASE_ORDER[number])
  return (
    <div style={{ ...glass, padding: 16, marginTop: 16, height: 'auto' }}>
      {PHASE_ORDER.map((p, i) => {
        const isDone = curIdx > i
        const active = curIdx === i
        const isAnalyze = p === 'RUN_ANALYZERS'
        const pct = isDone ? 100 : active ? (isAnalyze && progress.total > 0 ? Math.min(Math.round((progress.done / progress.total) * 100), 100) : 45) : 0
        const color = isDone ? GREEN : active ? GOLD : 'rgba(255,255,255,.18)'
        return (
          <div key={p} style={{ marginBottom: i < PHASE_ORDER.length - 1 ? 11 : 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: active ? '#fff' : isDone ? 'rgba(255,255,255,.7)' : 'rgba(255,255,255,.4)' }}>{labels[p]}</span>
              {isAnalyze && active && progress.total > 0 && (
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,.55)', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>{progress.done}/{progress.total}</span>
              )}
            </div>
            <div style={{ height: 6, borderRadius: 999, background: 'rgba(255,255,255,.07)', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 999, transition: 'width .3s ease' }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default function AuditConsolePage() {
  const { lang } = useI18n()
  const copy = copyFor(lang)

  const [prefix, setPrefix] = useState('saas/lib/audit')
  const [maxFiles, setMaxFiles] = useState(6)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [runs, setRuns] = useState<RunSummary[]>([])
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)
  const [view, setView] = useState<View | null>(null)
  const [phase, setPhase] = useState<string | null>(null)
  const [progress, setProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 })

  const [selectedFinding, setSelectedFinding] = useState<Finding | null>(null)
  const [entered, setEntered] = useState(false)
  const [patchState, setPatchState] = useState<'idle' | 'working' | 'done' | 'error'>('idle')
  const [patchResult, setPatchResult] = useState<{ branch: string; compareUrl: string } | null>(null)
  const [patchError, setPatchError] = useState<string | null>(null)
  useEffect(() => {
    setPatchState('idle'); setPatchResult(null); setPatchError(null)
    if (selectedFinding) { const id = requestAnimationFrame(() => setEntered(true)); return () => cancelAnimationFrame(id) }
    setEntered(false)
  }, [selectedFinding])

  async function generateFix(f: Finding) {
    setPatchState('working'); setPatchError(null); setPatchResult(null)
    try {
      const res = await fetch('/api/hub/operator/audit/patch', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ file: f.file, line: typeof f.line === 'number' ? f.line : undefined, title: f.title, detail: f.detail, recommendation: f.recommendation }),
      })
      const data = await res.json().catch(() => null)
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
      // Prefer the full-payload snapshot; fall back to normalized findings for older runs.
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

  return (
    <>
      <AuditDashboard />
      <div style={{ padding: '0 24px 24px', color: '#fff', maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ marginBottom: 18, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, letterSpacing: '-0.01em' }}>{copy.title} <span style={{ color: GOLD }}>·</span></h1>
          <p style={{ margin: '6px 0 0', fontSize: 13, color: 'rgba(255,255,255,.62)', maxWidth: 640, lineHeight: 1.5 }}>{copy.subtitle}</p>
        </div>
        <a href="/dashboard/audit/pricing" style={{ flexShrink: 0, display: 'inline-block', fontSize: 13, fontWeight: 800, color: '#070b14', background: 'linear-gradient(135deg, #ffc300, #ffb000)', textDecoration: 'none', borderRadius: 10, padding: '10px 18px', boxShadow: '0 8px 24px rgba(255,195,0,.25)' }}>{copy.viewPlans}</a>
      </div>

      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        {/* History sidebar */}
        <aside style={{ ...glass, flex: '1 1 260px', maxWidth: 300, minWidth: 240, padding: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,.5)' }}>{copy.history}</span>
            <button onClick={loadHistory} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,.18)', color: 'rgba(255,255,255,.75)', borderRadius: 8, padding: '3px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>{copy.refresh}</button>
          </div>
          {runs.length === 0 ? (
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,.4)', padding: '8px 2px' }}>{copy.noRuns}</div>
          ) : (
            <div style={{ height: 'auto', maxHeight: 'calc(100vh - 280px)', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {runs.map(r => {
                const active = r.id === selectedRunId
                return (
                  <button key={r.id} onClick={() => openRun(r.id)} style={{
                    textAlign: 'left', background: active ? 'rgba(26,240,255,.08)' : 'rgba(255,255,255,.03)',
                    border: `1px solid ${active ? 'rgba(26,240,255,.4)' : 'rgba(255,255,255,.08)'}`,
                    borderRadius: 10, padding: '9px 11px', cursor: 'pointer', color: '#fff',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: statusColor(r.status), flex: '0 0 auto' }} />
                      <span style={{ fontSize: 11, fontWeight: 700, color: statusColor(r.status) }}>{statusLabel(copy, r.status)}</span>
                      <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 800, color: r.findings_count > 0 ? GOLD : 'rgba(255,255,255,.45)' }}>{r.findings_count}</span>
                    </div>
                    <div style={{ marginTop: 4, fontSize: 10.5, color: 'rgba(255,255,255,.55)', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.prefix || '—'}</div>
                    <div style={{ marginTop: 2, fontSize: 10, color: 'rgba(255,255,255,.35)' }}>{timeShort(r.created_at, lang)}</div>
                  </button>
                )
              })}
            </div>
          )}
        </aside>

        {/* Main column */}
        <section style={{ flex: '999 1 420px', minWidth: 320 }}>
          {/* Run panel */}
          <div style={{ ...glass, padding: 18, display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'flex-end' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: '1 1 280px', minWidth: 200 }}>
              <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,.5)' }}>{copy.pathLabel}</span>
              <input value={prefix} onChange={e => setPrefix(e.target.value)} placeholder="saas/lib/audit" style={input} />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6, width: 110 }}>
              <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,.5)' }}>{copy.maxLabel}</span>
              <input type="number" min={1} max={60} value={maxFiles} onChange={e => setMaxFiles(Math.max(1, Math.min(60, Number(e.target.value) || 1)))} style={input} />
            </label>
            <button onClick={runNew} disabled={loading} style={{
              background: loading ? 'rgba(255,195,0,.14)' : 'linear-gradient(135deg, #ffc300, #ffb000)',
              color: loading ? GOLD : '#0a0e17', border: '1px solid rgba(255,195,0,.5)',
              borderRadius: 10, padding: '10px 20px', fontSize: 13, fontWeight: 800,
              cursor: loading ? 'default' : 'pointer', whiteSpace: 'nowrap',
            }}>{loading ? copy.running : copy.run}</button>
          </div>

          {phase && <PhaseTracker phase={phase} progress={progress} copy={copy} />}

          {error && (
            <div style={{ ...glass, marginTop: 16, padding: 14, border: '1px solid rgba(252,165,165,.4)', color: RED, fontSize: 13 }}>{copy.failed}: {error}</div>
          )}

          {view && (
            <div style={{ marginTop: 16 }}>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
                <Stat label={copy.filesScanned} value={String(view.filesScanned)} accent={CYAN} />
                <Stat label={copy.findings} value={String(view.findingsCount)} accent={GOLD} />
              </div>

              {findings.length === 0 ? (
                <div style={{ ...glass, padding: 18, fontSize: 13, color: 'rgba(255,255,255,.7)' }}>{copy.clean}</div>
              ) : (
                <div style={{ ...glass, padding: 6, height: 'auto', maxHeight: 'calc(100vh - 380px)', overflowY: 'auto' }}>
                  {findings.map((f, i) => {
                    const sev = asSev(f.severity)
                    const c = SEV_COLOR[sev]
                    return (
                      <div key={i} onClick={() => setSelectedFinding(f)} style={{ padding: 14, borderBottom: i < findings.length - 1 ? '1px solid rgba(255,255,255,.07)' : 'none', cursor: 'pointer' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.05em', textTransform: 'uppercase', color: c, border: `1px solid ${c}66`, borderRadius: 999, padding: '2px 9px' }}>{copy.sev[sev]}</span>
                          <span style={{ fontSize: 14, fontWeight: 700 }}>{f.title}</span>
                        </div>
                        <div style={{ marginTop: 6, fontSize: 11.5, color: 'rgba(255,255,255,.5)', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
                          {f.file}{typeof f.line === 'number' ? `  ·  ${copy.line} ${f.line}` : ''}  ·  {copy.category}: {f.category}
                        </div>
                        {f.detail && <p style={{ margin: '8px 0 0', fontSize: 13, lineHeight: 1.55, color: 'rgba(255,255,255,.85)' }}>{f.detail}</p>}
                        {f.recommendation && (
                          <div style={{ marginTop: 8, padding: '8px 12px', borderRadius: 8, background: 'rgba(26,240,255,.06)', border: '1px solid rgba(26,240,255,.2)' }}>
                            <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: CYAN }}>{copy.recommendation}</span>
                            <p style={{ margin: '4px 0 0', fontSize: 12.5, lineHeight: 1.5, color: 'rgba(255,255,255,.8)' }}>{f.recommendation}</p>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {!view && !error && !loading && (
            <div style={{ marginTop: 16, fontSize: 12.5, color: 'rgba(255,255,255,.4)' }}>{copy.emptyHint}</div>
          )}
        </section>
      </div>

      {/* Finding-detail drawer */}
      {selectedFinding && (() => {
        const sev = asSev(selectedFinding.severity)
        const c = SEV_COLOR[sev]
        return (
          <div
            onClick={() => setSelectedFinding(null)}
            style={{ position: 'fixed', inset: 0, zIndex: 1000, background: entered ? 'rgba(2,3,6,.62)' : 'rgba(2,3,6,0)', backdropFilter: entered ? 'blur(4px)' : 'none', WebkitBackdropFilter: entered ? 'blur(4px)' : 'none', transition: 'background .2s ease', display: 'flex', justifyContent: 'flex-end' }}
          >
            <div
              onClick={e => e.stopPropagation()}
              style={{
                width: 'min(480px, 100%)', height: '100vh', overflowY: 'auto',
                background: 'linear-gradient(160deg, rgba(15,23,42,.92), rgba(7,11,20,.96))',
                borderLeft: '1px solid rgba(255,255,255,.12)', boxShadow: '-20px 0 60px rgba(0,0,0,.5)',
                transform: entered ? 'translateX(0)' : 'translateX(100%)', transition: 'transform .25s ease',
                padding: 22, color: '#fff', boxSizing: 'border-box',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.05em', textTransform: 'uppercase', color: c, border: `1px solid ${c}66`, borderRadius: 999, padding: '3px 11px' }}>{copy.sev[sev]}</span>
                <button onClick={() => setSelectedFinding(null)} aria-label={copy.close} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,.18)', color: 'rgba(255,255,255,.8)', borderRadius: 8, width: 30, height: 30, cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>×</button>
              </div>

              <h2 style={{ margin: '14px 0 4px', fontSize: 18, fontWeight: 800, lineHeight: 1.3 }}>{selectedFinding.title}</h2>
              <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,.5)', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', wordBreak: 'break-all' }}>
                {selectedFinding.file}{typeof selectedFinding.line === 'number' ? `  ·  ${copy.line} ${selectedFinding.line}` : ''}
              </div>
              <div style={{ marginTop: 6, fontSize: 11, color: 'rgba(255,255,255,.45)' }}>{copy.category}: {selectedFinding.category}</div>

              {selectedFinding.detail && (
                <div style={{ marginTop: 18 }}>
                  <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,.5)', marginBottom: 6 }}>{copy.detail}</div>
                  <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.6, color: 'rgba(255,255,255,.88)' }}>{selectedFinding.detail}</p>
                </div>
              )}

              {selectedFinding.recommendation && (
                <div style={{ marginTop: 16, padding: '12px 14px', borderRadius: 10, background: 'rgba(26,240,255,.06)', border: '1px solid rgba(26,240,255,.22)' }}>
                  <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: CYAN, marginBottom: 6 }}>{copy.recommendation}</div>
                  <p style={{ margin: 0, fontSize: 13, lineHeight: 1.55, color: 'rgba(255,255,255,.85)' }}>{selectedFinding.recommendation}</p>
                </div>
              )}

              <a href={ghUrl(selectedFinding.file, selectedFinding.line)} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-block', marginTop: 18, fontSize: 12.5, fontWeight: 700, color: CYAN, textDecoration: 'none', border: '1px solid rgba(26,240,255,.35)', borderRadius: 10, padding: '8px 14px' }}>
                {copy.viewSource} ↗
              </a>

              {selectedFinding.recommendation && (
                <div style={{ marginTop: 20, paddingTop: 18, borderTop: '1px solid rgba(255,255,255,.1)' }}>
                  <button
                    onClick={() => selectedFinding && generateFix(selectedFinding)}
                    disabled={patchState === 'working' || patchState === 'done'}
                    style={{
                      background: patchState === 'working' ? 'rgba(255,195,0,.14)' : patchState === 'done' ? 'rgba(52,211,153,.12)' : 'linear-gradient(135deg, #ffc300, #ffb000)',
                      color: patchState === 'working' ? GOLD : patchState === 'done' ? GREEN : '#0a0e17',
                      border: `1px solid ${patchState === 'done' ? 'rgba(52,211,153,.5)' : 'rgba(255,195,0,.5)'}`,
                      borderRadius: 10, padding: '10px 18px', fontSize: 13, fontWeight: 800,
                      cursor: patchState === 'working' || patchState === 'done' ? 'default' : 'pointer', width: '100%',
                    }}
                  >
                    {patchState === 'working' ? copy.patching : patchState === 'done' ? `✓ ${copy.patchReady}` : copy.generateFix}
                  </button>

                  {patchState === 'done' && patchResult && (
                    <div style={{ marginTop: 12, padding: '12px 14px', borderRadius: 10, background: 'rgba(52,211,153,.06)', border: '1px solid rgba(52,211,153,.25)' }}>
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,.6)', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', wordBreak: 'break-all' }}>{patchResult.branch}</div>
                      <a href={patchResult.compareUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-block', marginTop: 8, fontSize: 12.5, fontWeight: 800, color: GREEN, textDecoration: 'none' }}>
                        {copy.reviewMerge} ↗
                      </a>
                    </div>
                  )}

                  {patchState === 'error' && patchError && (
                    <div style={{ marginTop: 12, padding: '11px 13px', borderRadius: 10, background: 'rgba(252,165,165,.08)', border: '1px solid rgba(252,165,165,.3)', color: RED, fontSize: 12.5, lineHeight: 1.5 }}>
                      {patchError}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )
      })()}
      </div>
    </>
  )
}

function Stat({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div style={{ ...glass, padding: '12px 18px', minWidth: 130 }}>
      <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,.5)' }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, color: accent, lineHeight: 1.1, marginTop: 2 }}>{value}</div>
    </div>
  )
}
