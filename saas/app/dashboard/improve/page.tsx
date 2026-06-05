'use client'

import { useState } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'
import { t } from '@/lib/i18n/t'
import SitePreview, { type SitePreviewContent } from '@/components/operator/SitePreview'

const GOLD = '#ffc300'
const CYAN = '#1af0ff'

type Status = 'pass' | 'warn' | 'fail'
type Check = { id: string; label: string; category: string; status: Status; detail: string; recommendation: string }
type Audit = { url: string; finalUrl: string; score: number; checks: Check[]; summary: string; source: string }
type StatusStep = { step: string; message: string }

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

// Optimizer: turn real audit findings into an editable rebuild brief.
function buildBrief(audit: Audit): string {
  let host = audit.finalUrl
  try { host = new URL(audit.finalUrl).hostname.replace(/^www\./, '') } catch {}
  const issues = audit.checks.filter(c => c.status !== 'pass' && c.recommendation)
  const fixes = issues.map(c => `- ${c.label}: ${c.recommendation}`).join('\n')
  return [
    `Rebuild an improved, modern version of the website ${host}.`,
    `Keep the same business, brand, and core offering, but fix the issues found in the audit and make it fast, mobile-first, accessible, and conversion-focused with a clear primary call-to-action.`,
    issues.length ? `\nAddress these specific improvements:\n${fixes}` : '',
  ].join('\n').trim()
}

export default function ImproveWebsitePage() {
  const { dict, lang } = useI18n()

  // Stage 1 — Analyze
  const [url, setUrl] = useState('')
  const [analyzing, setAnalyzing] = useState(false)
  const [error, setError] = useState('')
  const [audit, setAudit] = useState<Audit | null>(null)

  // Stage 2 — Optimize
  const [brief, setBrief] = useState('')

  // Stage 3 — Rebuild
  const [content, setContent] = useState<SitePreviewContent | null>(null)
  const [liveUrl, setLiveUrl] = useState<string | null>(null)
  const [building, setBuilding] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [steps, setSteps] = useState<StatusStep[]>([])
  const [message, setMessage] = useState('')

  async function analyze() {
    const value = url.trim()
    if (!value || analyzing) return
    setAnalyzing(true); setError(''); setAudit(null); setContent(null); setLiveUrl(null); setSteps([]); setMessage('')
    try {
      const res = await fetch('/api/improve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: value, language: lang }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data?.error || 'Could not audit that URL.'); return }
      setAudit(data)
      setBrief(buildBrief(data))
    } catch {
      setError('Something went wrong running the audit.')
    } finally {
      setAnalyzing(false)
    }
  }

  async function rebuild() {
    if (!brief.trim() || building) return
    setBuilding(true); setMessage(''); setContent(null); setLiveUrl(null); setSteps([])
    try {
      const res = await fetch('/api/sites/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: brief, language: lang }),
      })
      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({}))
        setMessage(err.error || 'Could not generate the improved site.')
        setBuilding(false)
        return
      }
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed) continue
          let chunk: any
          try { chunk = JSON.parse(trimmed) } catch { continue }
          if (chunk.type === 'status') {
            setSteps(prev => [...prev, { step: chunk.step, message: chunk.message }])
          } else if (chunk.type === 'result') {
            if (chunk.content) setContent(chunk.content)
            if (chunk.error && !chunk.content) setMessage(chunk.error)
          }
        }
      }
    } catch {
      setMessage('Could not connect to the rebuild engine. Please try again.')
    } finally {
      setBuilding(false)
    }
  }

  async function publish() {
    if (!content || publishing) return
    setPublishing(true); setMessage('')
    try {
      const res = await fetch('/api/sites/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, language: lang }),
      })
      const data = await res.json()
      if (!res.ok) setMessage(data.error || 'Could not publish the site.')
      else { setLiveUrl(data.url || null); setMessage(data.userMessage || 'Your improved website is live.') }
    } catch {
      setMessage('Could not connect. Please try again.')
    } finally {
      setPublishing(false)
    }
  }

  const categories = audit ? Array.from(new Set(audit.checks.map(c => c.category))) : []
  const fullUrl = liveUrl ? `${typeof window !== 'undefined' ? window.location.origin : ''}${liveUrl}` : null
return (
    <main style={{ padding: 24, color: '#fff', maxWidth: 960, margin: '0 auto' }}>
      <span className="sb-eyebrow">Website Optimization System</span>
      <h1 className="sb-h2" style={{ marginTop: 8 }}>🧭 {t(dict, 'services.improve.title', 'Optimize Website')}</h1>
      <p className="sb-body" style={{ maxWidth: 700 }}>
        {t(dict, 'services.improve.desc', 'Analyze any site, optimize the findings into a brief, and rebuild an improved version you can publish.')}
      </p>

      {/* Stage rail */}
      <div style={{ display: 'flex', gap: 8, margin: '18px 0 22px', flexWrap: 'wrap' }}>
        {[
          { n: 1, label: 'Analyze', done: !!audit },
          { n: 2, label: 'Optimize', done: !!audit },
          { n: 3, label: 'Rebuild', done: !!content },
        ].map(s => (
          <div key={s.n} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 14px', borderRadius: 999, background: s.done ? 'rgba(134,239,172,.12)' : 'rgba(255,255,255,.04)', border: `1px solid ${s.done ? 'rgba(134,239,172,.35)' : 'rgba(255,255,255,.1)'}` }}>
            <span style={{ width: 20, height: 20, borderRadius: 999, display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 900, background: s.done ? '#86efac' : 'rgba(255,255,255,.15)', color: s.done ? '#04210f' : '#fff' }}>{s.done ? '✓' : s.n}</span>
            <span style={{ fontSize: 13, fontWeight: 700 }}>{s.label}</span>
          </div>
        ))}
      </div>

      {/* ── Stage 1: Analyze ── */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <input
          className="sb-input"
          value={url}
          onChange={e => setUrl(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') analyze() }}
          placeholder="yourwebsite.com"
          style={{ flex: 1, minWidth: 240, padding: 14 }}
          disabled={analyzing}
        />
        <button
          onClick={analyze}
          disabled={analyzing || !url.trim()}
          style={{ background: GOLD, color: '#000', border: 'none', borderRadius: 12, padding: '0 28px', fontWeight: 800, cursor: analyzing ? 'wait' : 'pointer', opacity: analyzing || !url.trim() ? 0.6 : 1 }}
        >
          {analyzing ? 'Analyzing…' : 'Analyze website'}
        </button>
      </div>

      {error && <p className="sb-caption" style={{ color: '#fca5a5', marginTop: 12 }}>{error}</p>}
      {analyzing && <p className="sb-body" style={{ marginTop: 16 }}>Fetching the page and running checks…</p>}

      {audit && (
        <div style={{ marginTop: 24, display: 'grid', gap: 20 }}>
          {/* Score + summary */}
          <section className="sb-card" style={{ padding: 22, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 22, alignItems: 'center' }}>
            <div style={{ width: 110, height: 110, borderRadius: '50%', display: 'grid', placeItems: 'center', border: `6px solid ${scoreColor(audit.score)}`, flexShrink: 0 }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 30, fontWeight: 900, color: scoreColor(audit.score), lineHeight: 1 }}>{audit.score}</div>
                <div className="sb-caption">/ 100</div>
              </div>
            </div>
            <div style={{ minWidth: 0 }}>
              <div className="sb-caption" style={{ marginBottom: 6, wordBreak: 'break-all' }}>{audit.finalUrl}</div>
              <p className="sb-body" style={{ margin: 0, whiteSpace: 'pre-wrap', color: 'rgba(255,255,255,.85)' }}>{audit.summary}</p>
            </div>
          </section>

          {/* Checks by category */}
          {categories.map(cat => (
            <section key={cat}>
              <h2 className="sb-eyebrow" style={{ marginBottom: 10 }}>{cat}</h2>
              <div style={{ display: 'grid', gap: 8 }}>
                {audit.checks.filter(c => c.category === cat).map(c => {
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

          {/* ── Stage 2: Optimize (editable rebuild brief) ── */}
          <section className="sb-card" style={{ padding: 22, borderColor: 'rgba(26,240,255,.3)' }}>
            <span className="sb-eyebrow" style={{ color: CYAN }}>Optimize → rebuild brief</span>
            <p className="sb-body" style={{ marginTop: 8 }}>
              We turned the audit into a brief for the rebuild engine. Edit anything, then rebuild an improved version of the site.
            </p>
            <textarea
              className="sb-input"
              value={brief}
              onChange={e => setBrief(e.target.value)}
              rows={8}
              style={{ width: '100%', boxSizing: 'border-box', padding: 14, marginTop: 10, resize: 'vertical', whiteSpace: 'pre-wrap' }}
            />
            <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
              <button
                onClick={rebuild}
                disabled={building || !brief.trim()}
                style={{ background: GOLD, color: '#000', border: 'none', borderRadius: 12, padding: '12px 26px', fontWeight: 800, cursor: building ? 'wait' : 'pointer', opacity: building || !brief.trim() ? 0.6 : 1 }}
              >
                {building ? 'Rebuilding…' : '⚙️ Rebuild improved site'}
              </button>
              <button
                onClick={() => setBrief(buildBrief(audit))}
                disabled={building}
                className="sb-button-secondary"
              >
                Reset brief
              </button>
            </div>
          </section>
        </div>
      )}

      {/* ── Stage 3: Rebuild output ── */}
      {(building || steps.length > 0 || content || message) && (
        <section style={{ marginTop: 24 }}>
          <h2 className="sb-eyebrow" style={{ marginBottom: 10 }}>Rebuild engine</h2>

          {steps.length > 0 && !content && (
            <div className="sb-card" style={{ padding: 18, display: 'grid', gap: 8 }}>
              {steps.map((s, i) => (
                <div key={i} style={{ fontSize: 14, color: 'rgba(255,255,255,.8)' }}>{s.message}</div>
              ))}
            </div>
          )}

          {message && (
            <p className="sb-caption" style={{ color: liveUrl ? '#86efac' : '#fca5a5', marginTop: 12 }}>{message}</p>
          )}

          {content && (
            <div style={{ marginTop: 14 }}>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
                <button
                  onClick={publish}
                  disabled={publishing}
                  style={{ background: GOLD, color: '#000', border: 'none', borderRadius: 12, padding: '12px 26px', fontWeight: 800, cursor: publishing ? 'wait' : 'pointer', opacity: publishing ? 0.6 : 1 }}
                >
                  {publishing ? 'Publishing…' : '🚀 Publish improved site'}
                </button>
                {fullUrl && (
                  <a href={fullUrl} target="_blank" rel="noreferrer" className="sb-button-secondary" style={{ display: 'inline-flex', alignItems: 'center' }}>
                    View live site →
                  </a>
                )}
              </div>
              <div className="sb-card" style={{ padding: 0, overflow: 'hidden' }}>
                <SitePreview content={content} />
              </div>
            </div>
          )}
        </section>
      )}
    </main>
  )
}
