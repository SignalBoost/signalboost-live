'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'

type Item = { id: string; name: string; description?: string; source_url?: string; image_url?: string }
type HistoryPayload = {
  groupedItems: Record<string, Item[]>
  sources: Array<{ id: string; type: string; config: Record<string, unknown>; created_at: string }>
}

export default function SpreadsheetsPage() {
  const [data, setData] = useState<HistoryPayload>({ groupedItems: {}, sources: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const res = await fetch('/api/data-connectors/history', { cache: 'no-store' })
        const d = await res.json()
        if (!active) return
        if (!res.ok) setError(d?.error || 'Could not load your data.')
        setData({ groupedItems: d?.groupedItems || {}, sources: Array.isArray(d?.sources) ? d.sources : [] })
      } catch {
        if (active) setError('Something went wrong loading your data.')
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => { active = false }
  }, [])

  const rows = useMemo(() => {
    const out: Array<{ category: string } & Item> = []
    for (const [category, items] of Object.entries(data.groupedItems || {})) {
      for (const it of items || []) out.push({ category, ...it })
    }
    const term = query.trim().toLowerCase()
    if (!term) return out
    return out.filter(r =>
      [r.name, r.description, r.category, r.source_url]
        .filter(Boolean)
        .some(v => String(v).toLowerCase().includes(term))
    )
  }, [data, query])

  const th: React.CSSProperties = { textAlign: 'left', padding: '10px 12px', position: 'sticky', top: 0, background: '#0f1117', borderBottom: '1px solid rgba(255,255,255,.15)', fontSize: 12, textTransform: 'uppercase', letterSpacing: '.06em', color: 'rgba(255,255,255,.6)' }
  const td: React.CSSProperties = { padding: '10px 12px', borderBottom: '1px solid rgba(255,255,255,.06)', verticalAlign: 'top' }

  return (
    <main style={{ padding: 24, color: '#fff' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 16 }}>
        <div>
          <span className="sb-eyebrow">Spreadsheets</span>
          <h1 className="sb-h2" style={{ marginTop: 10 }}>Your imported data, in one grid.</h1>
          <p className="sb-body" style={{ maxWidth: 600 }}>
            Every item pulled in through your data connectors — searchable and grouped by category.
          </p>
        </div>
        <Link className="sb-button-primary" href="/dashboard/data" style={{ alignSelf: 'flex-start' }}>+ Import data</Link>
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
        <input
          className="sb-input"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search items, categories, descriptions…"
          style={{ padding: 12, flex: 1, minWidth: 220 }}
        />
        <span className="sb-caption">{rows.length} rows · {data.sources.length} sources</span>
      </div>

      {loading && <p className="sb-body">Loading data…</p>}
      {error && !loading && <p className="sb-caption" style={{ color: '#fca5a5' }}>{error}</p>}

      {!loading && !error && rows.length === 0 && (
        <div className="sb-card" style={{ padding: 24, textAlign: 'center' }}>
          <p className="sb-body" style={{ margin: 0 }}>No data yet.</p>
          <div style={{ marginTop: 14 }}>
            <Link className="sb-button-primary" href="/dashboard/data">Import your first dataset</Link>
          </div>
        </div>
      )}

      {rows.length > 0 && (
        <div className="sb-card" style={{ padding: 0, overflow: 'auto', maxHeight: '70vh' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr>
                <th style={th}>Name</th>
                <th style={th}>Category</th>
                <th style={th}>Description</th>
                <th style={th}>Source</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.id ?? `${r.category}-${i}`}>
                  <td style={{ ...td, fontWeight: 700, whiteSpace: 'nowrap' }}>{r.name}</td>
                  <td style={{ ...td, color: '#fde68a', whiteSpace: 'nowrap' }}>{r.category}</td>
                  <td style={{ ...td, color: 'rgba(255,255,255,.7)' }}>{r.description || '—'}</td>
                  <td style={td}>
                    {r.source_url
                      ? <a href={r.source_url} target="_blank" rel="noreferrer" style={{ color: '#7dd3fc' }}>link</a>
                      : <span style={{ opacity: 0.4 }}>—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  )
}
