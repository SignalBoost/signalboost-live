'use client'

// saas/app/dashboard/audit/page.tsx
// Audit Console — Step 1: shell + run trigger + findings display.
// Triggers POST /api/hub/operator/audit (owner-gated), renders findings.
// Fathom-glass aesthetic, 5-locale copy, height:auto + maxHeight scroll (no clipping).

import { useState } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'

const GOLD = '#ffc300'
const CYAN = '#1af0ff'

type Finding = {
  file: string
  severity: string
  category: string
  title: string
  detail: string
  recommendation: string
  line?: number | null
}
type RunResult = {
  ok: boolean
  runId?: string
  prefix?: string
  filesScanned?: string[]
  findingsCount?: number
  findings?: Finding[]
  error?: string
}

type Sev = 'critical' | 'high' | 'medium' | 'low' | 'info'
type AuditCopy = {
  title: string
  subtitle: string
  pathLabel: string
  maxLabel: string
  run: string
  running: string
  filesScanned: string
  findings: string
  clean: string
  emptyHint: string
  ownerOnly: string
  failed: string
  category: string
  recommendation: string
  line: string
  sev: Record<Sev, string>
}

const COPY: Record<string, AuditCopy> = {
  en: {
    title: 'Audit Console',
    subtitle: 'Deep security & quality scans on GPT‑5.5, isolated from live console traffic.',
    pathLabel: 'Scan path', maxLabel: 'Max files', run: 'Run audit', running: 'Running deep scan…',
    filesScanned: 'Files scanned', findings: 'Findings',
    clean: 'No findings — this scan came back clean.',
    emptyHint: 'Set a path and run a scan to see findings.',
    ownerOnly: 'Owner access is required to run audits.', failed: 'Audit failed',
    category: 'Category', recommendation: 'Recommendation', line: 'Line',
    sev: { critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low', info: 'Info' },
  },
  es: {
    title: 'Consola de Auditoría',
    subtitle: 'Análisis profundos de seguridad y calidad con GPT‑5.5, aislados del tráfico de la consola en vivo.',
    pathLabel: 'Ruta de análisis', maxLabel: 'Archivos máx.', run: 'Ejecutar auditoría', running: 'Ejecutando análisis profundo…',
    filesScanned: 'Archivos analizados', findings: 'Hallazgos',
    clean: 'Sin hallazgos: este análisis salió limpio.',
    emptyHint: 'Define una ruta y ejecuta un análisis para ver los hallazgos.',
    ownerOnly: 'Se requiere acceso de propietario para ejecutar auditorías.', failed: 'La auditoría falló',
    category: 'Categoría', recommendation: 'Recomendación', line: 'Línea',
    sev: { critical: 'Crítico', high: 'Alto', medium: 'Medio', low: 'Bajo', info: 'Info' },
  },
  pt: {
    title: 'Console de Auditoria',
    subtitle: 'Análises profundas de segurança e qualidade com GPT‑5.5, isoladas do tráfego do console ao vivo.',
    pathLabel: 'Caminho de análise', maxLabel: 'Máx. de arquivos', run: 'Executar auditoria', running: 'Executando análise profunda…',
    filesScanned: 'Arquivos analisados', findings: 'Constatações',
    clean: 'Nenhuma constatação — esta análise voltou limpa.',
    emptyHint: 'Defina um caminho e execute uma análise para ver as constatações.',
    ownerOnly: 'É necessário acesso de proprietário para executar auditorias.', failed: 'A auditoria falhou',
    category: 'Categoria', recommendation: 'Recomendação', line: 'Linha',
    sev: { critical: 'Crítico', high: 'Alto', medium: 'Médio', low: 'Baixo', info: 'Info' },
  },
  pl: {
    title: 'Konsola Audytu',
    subtitle: 'Dogłębne skany bezpieczeństwa i jakości na GPT‑5.5, odizolowane od ruchu konsoli na żywo.',
    pathLabel: 'Ścieżka skanowania', maxLabel: 'Maks. plików', run: 'Uruchom audyt', running: 'Trwa dogłębne skanowanie…',
    filesScanned: 'Przeskanowane pliki', findings: 'Wyniki',
    clean: 'Brak wyników — ten skan jest czysty.',
    emptyHint: 'Ustaw ścieżkę i uruchom skan, aby zobaczyć wyniki.',
    ownerOnly: 'Do uruchamiania audytów wymagany jest dostęp właściciela.', failed: 'Audyt nie powiódł się',
    category: 'Kategoria', recommendation: 'Zalecenie', line: 'Wiersz',
    sev: { critical: 'Krytyczny', high: 'Wysoki', medium: 'Średni', low: 'Niski', info: 'Info' },
  },
  ru: {
    title: 'Консоль аудита',
    subtitle: 'Глубокие проверки безопасности и качества на GPT‑5.5, изолированные от живого трафика консоли.',
    pathLabel: 'Путь сканирования', maxLabel: 'Макс. файлов', run: 'Запустить аудит', running: 'Выполняется глубокое сканирование…',
    filesScanned: 'Просканировано файлов', findings: 'Замечания',
    clean: 'Замечаний нет — сканирование чистое.',
    emptyHint: 'Укажите путь и запустите сканирование, чтобы увидеть замечания.',
    ownerOnly: 'Для запуска аудита требуется доступ владельца.', failed: 'Аудит не выполнен',
    category: 'Категория', recommendation: 'Рекомендация', line: 'Строка',
    sev: { critical: 'Критический', high: 'Высокий', medium: 'Средний', low: 'Низкий', info: 'Инфо' },
  },
}
function copyFor(lang: string): AuditCopy { return COPY[lang] || COPY.en }

const SEV_ORDER: Sev[] = ['critical', 'high', 'medium', 'low', 'info']
const SEV_COLOR: Record<Sev, string> = {
  critical: '#fca5a5', high: '#fb923c', medium: GOLD, low: CYAN, info: 'rgba(255,255,255,.6)',
}
function asSev(s: string): Sev {
  const k = String(s || 'info').toLowerCase() as Sev
  return SEV_ORDER.includes(k) ? k : 'info'
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
  const [result, setResult] = useState<RunResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function run() {
    setLoading(true); setError(null); setResult(null)
    try {
      const res = await fetch('/api/hub/operator/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ prefix: prefix.trim() || 'saas/app/api', maxFiles }),
      })
      const data = await res.json().catch(() => null)
      if (res.status === 403) { setError(copy.ownerOnly); return }
      if (!res.ok || !data?.ok) { setError(data?.error || copy.failed); return }
      setResult(data as RunResult)
    } catch {
      setError(copy.failed)
    } finally {
      setLoading(false)
    }
  }

  const findings = result?.findings || []

  return (
    <main style={{ padding: 24, color: '#fff', maxWidth: 980, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 18 }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, letterSpacing: '-0.01em' }}>
          {copy.title} <span style={{ color: GOLD }}>·</span>
        </h1>
        <p style={{ margin: '6px 0 0', fontSize: 13, color: 'rgba(255,255,255,.62)', maxWidth: 640, lineHeight: 1.5 }}>{copy.subtitle}</p>
      </div>

      {/* Run panel */}
      <div style={{ ...glass, padding: 18, display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'flex-end' }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: '1 1 320px', minWidth: 220 }}>
          <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,.5)' }}>{copy.pathLabel}</span>
          <input value={prefix} onChange={e => setPrefix(e.target.value)} placeholder="saas/lib/audit" style={input} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6, width: 120 }}>
          <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,.5)' }}>{copy.maxLabel}</span>
          <input type="number" min={1} max={25} value={maxFiles} onChange={e => setMaxFiles(Math.max(1, Math.min(25, Number(e.target.value) || 1)))} style={input} />
        </label>
        <button
          onClick={run}
          disabled={loading}
          style={{
            background: loading ? 'rgba(255,195,0,.14)' : 'linear-gradient(135deg, #ffc300, #ffb000)',
            color: loading ? GOLD : '#0a0e17', border: '1px solid rgba(255,195,0,.5)',
            borderRadius: 10, padding: '10px 20px', fontSize: 13, fontWeight: 800,
            cursor: loading ? 'default' : 'pointer', whiteSpace: 'nowrap',
          }}
        >
          {loading ? copy.running : copy.run}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div style={{ ...glass, marginTop: 16, padding: 14, border: '1px solid rgba(252,165,165,.4)', color: '#fca5a5', fontSize: 13 }}>
          {copy.failed}: {error}
        </div>
      )}

      {/* Results */}
      {result && (
        <div style={{ marginTop: 16 }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
            <Stat label={copy.filesScanned} value={String(result.filesScanned?.length ?? 0)} accent={CYAN} />
            <Stat label={copy.findings} value={String(result.findingsCount ?? 0)} accent={GOLD} />
          </div>

          {findings.length === 0 ? (
            <div style={{ ...glass, padding: 18, fontSize: 13, color: 'rgba(255,255,255,.7)' }}>{copy.clean}</div>
          ) : (
            <div style={{ ...glass, padding: 6, height: 'auto', maxHeight: 'calc(100vh - 360px)', overflowY: 'auto' }}>
              {findings.map((f, i) => {
                const sev = asSev(f.severity)
                const c = SEV_COLOR[sev]
                return (
                  <div key={i} style={{ padding: 14, borderBottom: i < findings.length - 1 ? '1px solid rgba(255,255,255,.07)' : 'none' }}>
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

      {/* Empty hint */}
      {!result && !error && !loading && (
        <div style={{ marginTop: 16, fontSize: 12.5, color: 'rgba(255,255,255,.4)' }}>{copy.emptyHint}</div>
      )}
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
