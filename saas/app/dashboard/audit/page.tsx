'use client'

// saas/app/dashboard/audit/page.tsx
// Audit Console — Steps 2+3: run trigger + run-history sidebar + browse past runs
// + finding-detail drawer (click a finding → right slide-in with detail,
// recommendation, source line, and a GitHub deep-link). Read-only.
// POST /api/hub/operator/audit (run), GET /api/hub/operator/audit/runs (history/detail).
// Fathom-glass aesthetic, 5-locale copy, height:auto + maxHeight scroll (no clipping).

import { useCallback, useEffect, useState } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'

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
  title: string; subtitle: string
  pathLabel: string; maxLabel: string; run: string; running: string
  filesScanned: string; findings: string; clean: string; emptyHint: string
  ownerOnly: string; failed: string; category: string; recommendation: string; line: string
  history: string; noRuns: string; refresh: string
  statusRunning: string; statusComplete: string; statusFailed: string
  detail: string; close: string; viewSource: string
  sev: Record<Sev, string>
}

const COPY: Record<string, AuditCopy> = {
  en: {
    title: 'Audit Console', subtitle: 'Deep security & quality scans on GPT‑5.5, isolated from live console traffic.',
    pathLabel: 'Scan path', maxLabel: 'Max files', run: 'Run audit', running: 'Running deep scan…',
    filesScanned: 'Files scanned', findings: 'Findings', clean: 'No findings — this scan came back clean.',
    emptyHint: 'Set a path and run a scan, or pick a past run.',
    ownerOnly: 'Owner access is required to run audits.', failed: 'Audit failed',
    category: 'Category', recommendation: 'Recommendation', line: 'Line',
    history: 'Run history', noRuns: 'No runs yet.', refresh: 'Refresh',
    statusRunning: 'Running', statusComplete: 'Complete', statusFailed: 'Failed',
    detail: 'Detail', close: 'Close', viewSource: 'View on GitHub',
    sev: { critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low', info: 'Info' },
  },
  es: {
    title: 'Consola de Auditoría', subtitle: 'Análisis profundos de seguridad y calidad con GPT‑5.5, aislados del tráfico de la consola en vivo.',
    pathLabel: 'Ruta de análisis', maxLabel: 'Archivos máx.', run: 'Ejecutar auditoría', running: 'Ejecutando análisis profundo…',
    filesScanned: 'Archivos analizados', findings: 'Hallazgos', clean: 'Sin hallazgos: este análisis salió limpio.',
    emptyHint: 'Define una ruta y ejecuta un análisis, o elige una ejecución anterior.',
    ownerOnly: 'Se requiere acceso de propietario para ejecutar auditorías.', failed: 'La auditoría falló',
    category: 'Categoría', recommendation: 'Recomendación', line: 'Línea',
    history: 'Historial', noRuns: 'Aún no hay ejecuciones.', refresh: 'Actualizar',
    statusRunning: 'En curso', statusComplete: 'Completado', statusFailed: 'Falló',
    detail: 'Detalle', close: 'Cerrar', viewSource: 'Ver en GitHub',
    sev: { critical: 'Crítico', high: 'Alto', medium: 'Medio', low: 'Bajo', info: 'Info' },
  },
  pt: {
    title: 'Console de Auditoria', subtitle: 'Análises profundas de segurança e qualidade com GPT‑5.5, isoladas do tráfego do console ao vivo.',
    pathLabel: 'Caminho de análise', maxLabel: 'Máx. de arquivos', run: 'Executar auditoria', running: 'Executando análise profunda…',
    filesScanned: 'Arquivos analisados', findings: 'Constatações', clean: 'Nenhuma constatação — esta análise voltou limpa.',
    emptyHint: 'Defina um caminho e execute uma análise, ou escolha uma execução anterior.',
    ownerOnly: 'É necessário acesso de proprietário para executar auditorias.', failed: 'A auditoria falhou',
    category: 'Categoria', recommendation: 'Recomendação', line: 'Linha',
    history: 'Histórico', noRuns: 'Ainda não há execuções.', refresh: 'Atualizar',
    statusRunning: 'Em execução', statusComplete: 'Concluído', statusFailed: 'Falhou',
    detail: 'Detalhe', close: 'Fechar', viewSource: 'Ver no GitHub',
    sev: { critical: 'Crítico', high: 'Alto', medium: 'Médio', low: 'Baixo', info: 'Info' },
  },
  pl: {
    title: 'Konsola Audytu', subtitle: 'Dogłębne skany bezpieczeństwa i jakości na GPT‑5.5, odizolowane od ruchu konsoli na żywo.',
    pathLabel: 'Ścieżka skanowania', maxLabel: 'Maks. plików', run: 'Uruchom audyt', running: 'Trwa dogłębne skanowanie…',
    filesScanned: 'Przeskanowane pliki', findings: 'Wyniki', clean: 'Brak wyników — ten skan jest czysty.',
    emptyHint: 'Ustaw ścieżkę i uruchom skan lub wybierz wcześniejsze uruchomienie.',
    ownerOnly: 'Do uruchamiania audytów wymagany jest dostęp właściciela.', failed: 'Audyt nie powiódł się',
    category: 'Kategoria', recommendation: 'Zalecenie', line: 'Wiersz',
    history: 'Historia', noRuns: 'Brak uruchomień.', refresh: 'Odśwież',
    statusRunning: 'W toku', statusComplete: 'Zakończono', statusFailed: 'Niepowodzenie',
    detail: 'Szczegóły', close: 'Zamknij', viewSource: 'Zobacz na GitHub',
    sev: { critical: 'Krytyczny', high: 'Wysoki', medium: 'Średni', low: 'Niski', info: 'Info' },
  },
  ru: {
    title: 'Консоль аудита', subtitle: 'Глубокие проверки безопасности и качества на GPT‑5.5, изолированные от живого трафика консоли.',
    pathLabel: 'Путь сканирования', maxLabel: 'Макс. файлов', run: 'Запустить аудит', running: 'Выполняется глубокое сканирование…',
    filesScanned: 'Просканировано файлов', findings: 'Замечания', clean: 'Замечаний нет — сканирование чистое.',
    emptyHint: 'Укажите путь и запустите сканирование или выберите прошлый запуск.',
    ownerOnly: 'Для запуска аудита требуется доступ владельца.', failed: 'Аудит не выполнен',
    category: 'Категория', recommendation: 'Рекомендация', line: 'Строка',
    history: 'История запусков', noRuns: 'Запусков пока нет.', refresh: 'Обновить',
    statusRunning: 'Выполняется', statusComplete: 'Завершено', statusFailed: 'Ошибка',
    detail: 'Подробности', close: 'Закрыть', viewSource: 'Открыть на GitHub',
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

  const [selectedFinding, setSelectedFinding] = useState<Finding | null>(null)
  const [entered, setEntered] = useState(false)
  useEffect(() => {
    if (selectedFinding) { const id = requestAnimationFrame(() => setEntered(true)); return () => cancelAnimationFrame(id) }
    setEntered(false)
  }, [selectedFinding])

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
    try {
      const res = await fetch('/api/hub/operator/audit', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ prefix: prefix.trim() || 'saas/app/api', maxFiles }),
      })
      const data = await res.json().catch(() => null)
      if (res.status === 403) { setError(copy.ownerOnly); return }
      if (!res.ok || !data?.ok) { setError(data?.error || copy.failed); return }
      setView({ findings: data.findings || [], filesScanned: (data.filesScanned || []).length, findingsCount: data.findingsCount || 0, prefix: data.prefix, status: 'complete' })
      setSelectedRunId(data.runId || null)
      loadHistory()
    } catch {
      setError(copy.failed)
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
      setView({ findings: data.findings || [], filesScanned: r?.files_scanned || 0, findingsCount: r?.findings_count || 0, prefix: r?.prefix, status: r?.status })
    } catch {
      setError(copy.failed)
    }
  }

  const findings = view?.findings || []

  return (
    <main style={{ padding: 24, color: '#fff', maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ marginBottom: 18 }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, letterSpacing: '-0.01em' }}>{copy.title} <span style={{ color: GOLD }}>·</span></h1>
        <p style={{ margin: '6px 0 0', fontSize: 13, color: 'rgba(255,255,255,.62)', maxWidth: 640, lineHeight: 1.5 }}>{copy.subtitle}</p>
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
            </div>
          </div>
        )
      })()}
    </main>
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
