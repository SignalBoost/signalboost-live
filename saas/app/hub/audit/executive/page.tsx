'use client'

// saas/app/hub/audit/executive/page.tsx
// Executive Risk Summary page — fetches the owner-gated report and renders the
// ExecutiveSummary component with loading / error states. Passes the active
// language so the LLM narrative comes back localized.

import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { useTranslation } from '@/components/i18n/useTranslation'
import { interpolate } from '@/lib/i18n/interpolate'
import ExecutiveSummary, { type ExecutiveSummaryView } from '@/components/audit/ExecutiveSummary'
import ReportExportBar from '@/components/audit/ReportExportBar'
import { toCsv } from '@/lib/audit/exportCsv'

// Flat result shape — the repo's tsconfig is non-strict, so discriminated unions
// do not narrow on `if (!json.ok)`. Keep ok/report/error on one object.
type ApiResponse = { ok: boolean; report?: ExecutiveSummaryView; error?: string }

const wrap: CSSProperties = { minHeight: 'calc(100vh - 80px)' }

export default function ExecutiveSummaryPage() {
  const { t, lang } = useTranslation()

  const [data, setData] = useState<ExecutiveSummaryView | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      setLoading(true)
      try {
        const res = await fetch(`/api/hub/audit/executive-summary?lang=${encodeURIComponent(lang || 'en')}`, { credentials: 'include' })
        const json = (await res.json().catch(() => null)) as ApiResponse | null
        if (!alive) return
        if (!json) {
          setError(t('audit.exec.loadError', 'Could not load the summary.'))
          return
        }
        if (!json.ok || !json.report) {
          setError(json.error || t('audit.exec.loadError', 'Could not load the summary.'))
          return
        }
        setData(json.report)
        setError(null)
      } catch (err: unknown) {
        if (!alive) return
        const msg = err instanceof Error ? err.message : String(err)
        setError(interpolate(t('audit.exec.fetchError', 'Error: {msg}'), { msg }))
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => { alive = false }
  }, [lang, t])

  if (loading) {
    return (
      <main style={{ ...wrap, display: 'grid', placeItems: 'center', color: 'rgba(255,255,255,.6)', padding: 24 }}>
        {t('audit.exec.loading', 'Building executive summary…')}
      </main>
    )
  }

  if (error) {
    return (
      <main style={{ ...wrap, display: 'grid', placeItems: 'center', color: '#fca5a5', padding: 24 }}>
        {error}
      </main>
    )
  }

  if (!data) return null
  const csv = toCsv(
    ['Severity', 'Title', 'Detail', 'Recommendation'],
    data.topRisks.map(f => [f.severity, f.fallback.title, f.fallback.detail, f.fallback.recommendation]),
  )
  const deep = ((data as any).deepReport as string) || ''
  return (
    <>
      <ReportExportBar filename="executive-risk-summary" csv={csv} />
      <ExecutiveSummary data={data} />
      {deep ? (
        <main style={{ maxWidth: 980, margin: '0 auto', padding: '4px 24px 56px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '10px 0 14px' }}>
            <span aria-hidden style={{ color: '#ffc300' }}>✍️</span>
            <h2 style={{ fontSize: 13, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,.6)', margin: 0 }}>
              {t('audit.exec.deepTitle', 'Full Narrative Report')}
            </h2>
          </div>
          <article style={{ border: '1px solid rgba(255,255,255,.08)', borderRadius: 10, background: 'rgba(255,255,255,.02)', padding: '18px 24px' }}>
            <Markdown source={deep} />
          </article>
        </main>
      ) : null}
    </>
  )
}

// ── Lightweight, dependency-free markdown renderer (headings, paragraphs, bold,
// inline code, code fences, bullet/ordered lists, blockquotes, and tables). Styled
// with the audit palette (gold #ffc300, cyan #1af0ff). ──────────────────────────
const MD_TXT = 'rgba(255,255,255,.82)'

function mdInline(text: string, keyBase: string): ReactNode[] {
  const nodes: ReactNode[] = []
  const re = /(\*\*([^*]+)\*\*|`([^`]+)`)/g
  let last = 0, k = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index))
    if (m[2] !== undefined) {
      nodes.push(<strong key={`${keyBase}-b${k}`} style={{ color: '#fff', fontWeight: 700 }}>{m[2]}</strong>)
    } else if (m[3] !== undefined) {
      nodes.push(<code key={`${keyBase}-c${k}`} style={{ fontFamily: 'ui-monospace, SFMono-Regular, monospace', fontSize: '.86em', background: 'rgba(26,240,255,.08)', color: '#1af0ff', padding: '1px 5px', borderRadius: 4 }}>{m[3]}</code>)
    }
    last = m.index + m[0].length; k++
  }
  if (last < text.length) nodes.push(text.slice(last))
  return nodes
}

function Markdown({ source }: { source: string }) {
  const lines = String(source || '').replace(/\r\n/g, '\n').split('\n')
  const out: ReactNode[] = []
  let i = 0, key = 0

  while (i < lines.length) {
    const line = lines[i]

    if (/^```/.test(line)) {
      const buf: string[] = []; i++
      while (i < lines.length && !/^```/.test(lines[i])) { buf.push(lines[i]); i++ }
      i++
      out.push(<pre key={key++} style={{ overflowX: 'auto', background: 'rgba(0,0,0,.35)', border: '1px solid rgba(255,255,255,.08)', borderRadius: 8, padding: 12, margin: '10px 0' }}><code style={{ fontFamily: 'ui-monospace, SFMono-Regular, monospace', fontSize: 12.5, color: '#cfe7ff', whiteSpace: 'pre' }}>{buf.join('\n')}</code></pre>)
      continue
    }

    if (/^\s*\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) {
      const header = line.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim())
      i += 2
      const rows: string[][] = []
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) {
        rows.push(lines[i].trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim())); i++
      }
      out.push(
        <div key={key++} style={{ overflowX: 'auto', margin: '12px 0' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
            <thead><tr>{header.map((h, hi) => <th key={hi} style={{ textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid rgba(255,255,255,.16)', color: '#ffc300', fontWeight: 700, whiteSpace: 'nowrap' }}>{mdInline(h, `th${key}-${hi}`)}</th>)}</tr></thead>
            <tbody>{rows.map((r, ri) => <tr key={ri}>{r.map((c, ci) => <td key={ci} style={{ padding: '8px 10px', borderBottom: '1px solid rgba(255,255,255,.06)', color: MD_TXT, verticalAlign: 'top' }}>{mdInline(c, `td${key}-${ri}-${ci}`)}</td>)}</tr>)}</tbody>
          </table>
        </div>
      )
      continue
    }

    const h = line.match(/^(#{1,4})\s+(.*)$/)
    if (h) {
      const lvl = h[1].length
      const sizes = [22, 18, 15, 13.5]
      out.push(<div key={key++} style={{ fontSize: sizes[lvl - 1], fontWeight: 700, color: lvl <= 2 ? '#fff' : '#ffc300', margin: lvl === 1 ? '20px 0 10px' : '16px 0 8px', lineHeight: 1.3 }}>{mdInline(h[2], `h${key}`)}</div>)
      i++; continue
    }

    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) { items.push(lines[i].replace(/^\s*[-*]\s+/, '')); i++ }
      out.push(<ul key={key++} style={{ margin: '8px 0', paddingLeft: 22, color: MD_TXT, lineHeight: 1.65 }}>{items.map((it, ii) => <li key={ii} style={{ margin: '3px 0' }}>{mdInline(it, `ul${key}-${ii}`)}</li>)}</ul>)
      continue
    }

    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) { items.push(lines[i].replace(/^\s*\d+\.\s+/, '')); i++ }
      out.push(<ol key={key++} style={{ margin: '8px 0', paddingLeft: 24, color: MD_TXT, lineHeight: 1.65 }}>{items.map((it, ii) => <li key={ii} style={{ margin: '3px 0' }}>{mdInline(it, `ol${key}-${ii}`)}</li>)}</ol>)
      continue
    }

    if (/^\s*>\s?/.test(line)) {
      out.push(<blockquote key={key++} style={{ borderLeft: '3px solid #ffc300', margin: '10px 0', padding: '4px 14px', color: 'rgba(255,255,255,.72)', background: 'rgba(255,255,255,.02)' }}>{mdInline(line.replace(/^\s*>\s?/, ''), `bq${key}`)}</blockquote>)
      i++; continue
    }

    if (line.trim() === '') { i++; continue }

    const buf: string[] = [line]; i++
    while (i < lines.length && lines[i].trim() !== '' && !/^(#{1,4}\s|```|\s*[-*]\s|\s*\d+\.\s|\s*>\s|\s*\|)/.test(lines[i])) { buf.push(lines[i]); i++ }
    out.push(<p key={key++} style={{ margin: '9px 0', color: MD_TXT, lineHeight: 1.7, fontSize: 14 }}>{mdInline(buf.join(' '), `p${key}`)}</p>)
  }

  return <div>{out}</div>
}
