'use client'

import { useState } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'
import { t } from '@/lib/i18n/t'

const GOLD = '#ffc300'

type Status = 'pass' | 'warn' | 'fail'
type Check = { id: string; label: string; category: string; status: Status; detail: string; recommendation: string }
type Result = { url: string; feedUrl: string; show: string; episodes: number; score: number; checks: Check[]; summary: string; source: string }

const STATUS_UI: Record<Status, { color: string; bg: string; icon: string }> = {
  pass: { color: '#86efac', bg: 'rgba(134,239,172,.12)', icon: '✓' },
  warn: { color: '#fde68a', bg: 'rgba(253,230,138,.12)', icon: '!' },
  fail: { color: '#fca5a5', bg: 'rgba(252,165,165,.12)', icon: '×' },
}
function scoreColor(s: number) {
  if (s >= 80) return '#86efac'
  if (s >= 50) return '#fde68a'
  return '#fca5a5'
}

export default function PodcastStudioOptimizationPage() {
  const { dict, lang } = useI18n()
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<Result | null>(null)

  async function audit() {
    const value = url.trim()
    if (!value || loading) return
    setLoading(true); setError(''); setResult(null)
    try {
      const res = await fetch('/api/podcast/optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: value, language: lang }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data?.error || 'Could not audit that feed.'); return }
      setResult(data)
    } catch {
      setError('Something went wrong running the audit.')
    } finally {
      setLoading(false)
    }
  }

  const categories = result ? Array.from(new Set(result.checks.map(c => c.category))) : []

  return (
    <main style={{ padding: 24, color: '#fff', maxWidth: 920, margin: '0 auto' }}>
      <span className="sb-eyebrow">SignalBoost service</span>
      <h1 className="sb-h2" style={{ marginTop: 8 }}>🎚️ {t(dict, 'services.podcastStudio.title', 'Optimize Podcast Studio')}</h1>
      <p className="sb-body" style={{ maxWidth: 700 }}>
        {t(dict, 'services.podcastStudio.desc', 'Audit your podcast feed for Apple/Spotify requirements, episode quality, and growth — and get a prioritized action plan.')}
      </p>

      <div style={{ display: 'flex', gap: 10, marginTop: 18, flexWrap: 'wrap' }}>
        <input
          className="sb-input"
          value={url}
          onChange={e => setUrl(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') audit() }}
          placeholder="Your RSS feed URL, or an Apple Podcasts link"
          style={{ flex: 1, minWidth: 260, padding: 14 }}
          disabled={loading}
        />
        <button
          onClick={audit}
          disabled={loading || !url.trim()}
          style={{ background: GOLD, color: '#000', border: 'none', borderRadius: 12, padding: '0 28px', fontWeight: 800, cursor: loading ? 'wait' : 'pointer', opacity: loading || !url.trim() ? 0.6 : 1 }}
        >
          {loading ? 'Auditing…' : 'Audit podcast'}
        </button>
      </div>
      <p className="sb-caption" style={{ marginTop: 8, opacity: .7 }}>
        Don’t have your feed URL? Paste your Apple Podcasts page link and we’ll find it.
      </p>

      {error && <p className="sb-caption" style={{ color: '#fca5a5', marginTop: 12 }}>{error}</p>}
      {loading && <p className="sb-body" style={{ marginTop: 16 }}>Fetching your feed and running checks…</p>}

      {result && (
        <div style={{ marginTop: 24, display: 'grid', gap: 20 }}>
          <section className="sb-card" style={{ padding: 22, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 22, alignItems: 'center' }}>
            <div style={{ width: 110, height: 110, borderRadius: '50%', display: 'grid', placeItems: 'center', border: `6px solid ${scoreColor(result.score)}`, flexShrink: 0 }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 30, fontWeight: 900, color: scoreColor(result.score), lineHeight: 1 }}>{result.score}</div>
                <div className="sb-caption">/ 100</div>
              </div>
            </div>
            <div style={{ minWidth: 0 }}>
              {result.show && <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 2 }}>{result.show}</div>}
              <div className="sb-caption" style={{ marginBottom: 8 }}>{result.episodes} episodes · {result.feedUrl}</div>
              <p className="sb-body" style={{ margin: 0, whiteSpace: 'pre-wrap', color: 'rgba(255,255,255,.85)' }}>{result.summary}</p>
              {result.source === 'deterministic' && (
                <p className="sb-caption" style={{ marginTop: 8, opacity: .6 }}>Tip: connect an AI key for a richer, written action plan.</p>
              )}
            </div>
          </section>

          {categories.map(cat => (
            <section key={cat}>
              <h2 className="sb-eyebrow" style={{ marginBottom: 10 }}>{cat}</h2>
              <div style={{ display: 'grid', gap: 8 }}>
                {result.checks.filter(c => c.category === cat).map(c => {
                  const ui = STATUS_UI[c.status]
                  return (
                    <div key={c.id} className="sb-card" style={{ padding: 14, display: 'grid', gridTemplateColumns: '28px 1fr', gap: 12, alignItems: 'start' }}>
                      <span style={{ width: 26, height: 26, borderRadius: 999, display: 'grid', placeItems: 'center', background: ui.bg, color: ui.color, fontWeight: 900 }}>{ui.icon}</span>
                      <div style={{ minWidth: 0 }}>
                        <strong style={{ color: '#fff' }}>{c.label}</strong>
                        <div className="sb-body" style={{ fontSize: 13, marginTop: 2 }}>{c.detail}</div>
                        {c.status !== 'pass' && c.recommendation && (
                          <div style={{ fontSize: 13, marginTop: 6, color: ui.color }}>→ {c.recommendation}</div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </main>
  )
}
