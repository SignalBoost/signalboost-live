'use client'

// saas/app/dashboard/operator/page.tsx
//
// The REAL Website Operator. Calls /api/sites/generate (the AI design brain)
// and /api/sites/publish (the publish chain). Uses the project-wide useI18n
// pattern (NOT useTranslation, which is inconsistent with the rest of the app).

import { useState } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'
import { t } from '@/lib/i18n/t'
import SitePreview, { type SitePreviewContent } from '@/components/operator/SitePreview'

export default function OperatorPage() {
  const { dict, lang } = useI18n()
  const tr = (key: string, fallback: string) => t(dict, key, fallback)

  const [request, setRequest] = useState('')
  const [content, setContent] = useState<SitePreviewContent | null>(null)
  const [liveUrl, setLiveUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [message, setMessage] = useState('')
  const [aiUnderstanding, setAiUnderstanding] = useState<any | null>(null)
  const [sourceHistory, setSourceHistory] = useState<any[]>([])

  async function generate() {
    setLoading(true); setMessage(''); setLiveUrl(null); setContent(null); setAiUnderstanding(null); setSourceHistory([])
    try {
      const res = await fetch('/api/sites/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: request, language: lang }),
      })
      const data = await res.json()
      if (!res.ok) setMessage(data.error || tr('operator.errors.plan', 'Could not generate the website.'))
      else {
        setContent(data.content)
        setAiUnderstanding(data.aiUnderstanding || null)
        setSourceHistory(Array.isArray(data.sourceHistory) ? data.sourceHistory : [])
      }
    } catch {
      setMessage(tr('operator.errors.connect', 'Could not connect. Please try again.'))
    } finally {
      setLoading(false)
    }
  }

  async function publish() {
    if (!content) return
    setPublishing(true); setMessage('')
    try {
      const res = await fetch('/api/sites/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, language: lang }),
      })
      const data = await res.json()
      if (!res.ok) setMessage(data.error || tr('operator.errors.publish', 'Could not publish the website.'))
      else { setLiveUrl(data.url || null); setMessage(data.userMessage || tr('operator.success.published', 'Your website is live.')) }
    } catch {
      setMessage(tr('operator.errors.connect', 'Could not connect. Please try again.'))
    } finally {
      setPublishing(false)
    }
  }

  function reset() {
    setContent(null); setLiveUrl(null); setMessage(''); setRequest(''); setLoading(false); setPublishing(false); setAiUnderstanding(null); setSourceHistory([])
  }

  const fullUrl = liveUrl ? `${typeof window !== 'undefined' ? window.location.origin : ''}${liveUrl}` : null
  const placeholder = tr('operator.input.placeholder', 'e.g. A cozy Italian restaurant in São Paulo with a menu, our story, and a reservation button')

  return (
    <main className="sb-page" style={{ maxWidth: 1240 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 440px) 1fr', gap: 24, alignItems: 'start' }} className="sb-operator-grid">

        {/* ── Left: input ── */}
        <section className="hero-panel" style={{ padding: 24, position: 'sticky', top: 16 }}>
          <div className="sb-kicker">🤖 {tr('operator.title.kicker', 'AI Website Operator')}</div>
          <h1 className="sb-title" style={{ marginBottom: 8, fontSize: 28 }}>{tr('operator.title.main', 'Describe your website')}</h1>
          <p className="sb-subtitle" style={{ marginTop: 0 }}>{tr('operator.title.subtitle', 'Tell me about your business. I will design a complete website — and you can publish it live in one click.')}</p>

          <textarea
            value={request}
            onChange={(e) => setRequest(e.target.value)}
            rows={5}
            placeholder={placeholder}
            style={{ width: '100%', marginTop: 14, borderRadius: 14, border: '1px solid var(--border-soft)', background: 'rgba(255,255,255,.02)', color: '#fff', padding: 12, fontSize: 14, lineHeight: 1.5, resize: 'vertical' }}
          />

          <div style={{ marginTop: 14, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button className="sb-button-primary" onClick={generate} disabled={loading || !request.trim()}>
              {loading
                ? `✨ ${tr('operator.cta.designing', 'Designing…')}`
                : content
                  ? `↻ ${tr('operator.cta.regenerate', 'Regenerate')}`
                  : `✨ ${tr('operator.cta.design', 'Design my website')}`}
            </button>
            {(content || liveUrl || request) && (
              <button className="sb-button-ghost" onClick={reset} disabled={loading || publishing}>
                {tr('reset', 'Start over')}
              </button>
            )}
          </div>

          {content && !liveUrl && (
            <div style={{ marginTop: 18, paddingTop: 18, borderTop: '1px solid var(--border-soft)' }}>
              <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 0 }}>{tr('operator.publish.hint', 'Happy with it? Publish it to a live web address.')}</p>
              <button className="sb-button-primary" onClick={publish} disabled={publishing} style={{ width: '100%' }}>
                {publishing
                  ? `🚀 ${tr('operator.publish.loading', 'Publishing…')}`
                  : `🚀 ${tr('operator.publish.cta', 'Publish website')}`}
              </button>
            </div>
          )}

          {liveUrl && fullUrl && (
            <div style={{ marginTop: 18, paddingTop: 18, borderTop: '1px solid var(--border-gold)' }}>
              <div style={{ color: '#fff', fontWeight: 800, marginBottom: 6 }}>🎉 {tr('operator.live', 'Your website is live')}</div>
              <a href={liveUrl} target="_blank" rel="noopener noreferrer" className="sb-button-primary" style={{ display: 'inline-block', wordBreak: 'break-all', width: '100%', textAlign: 'center' }}>
                {fullUrl} ↗
              </a>
            </div>
          )}



          {aiUnderstanding && (
            <div style={{ marginTop: 14, padding: 12, borderRadius: 12, border: '1px solid var(--border-soft)', background: 'rgba(255,255,255,.02)', fontSize: 12, color: 'var(--text-secondary)' }}>
              <div><strong>🧠 AI understanding:</strong> {aiUnderstanding.message}</div>
              <div style={{ marginTop: 6 }}>Intent: <strong>{aiUnderstanding.intent}</strong> · Confidence: <strong>{Math.round((aiUnderstanding.confidence || 0) * 100)}%</strong></div>
              <div style={{ marginTop: 6 }}>Query: <code>{aiUnderstanding.query}</code></div>
              {Array.isArray(aiUnderstanding.keywords) && aiUnderstanding.keywords.length > 0 && (
                <div style={{ marginTop: 6 }}>Keywords: {aiUnderstanding.keywords.join(', ')}</div>
              )}
            </div>
          )}

          {sourceHistory.length > 0 && (
            <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text-muted)' }}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>Source history</div>
              {sourceHistory.map((row, idx) => (
                <div key={idx}>• {row.source} · {row.query} · {row.importedCount} items</div>
              ))}
            </div>
          )}

                    {message && !liveUrl && <p style={{ marginTop: 14, color: 'var(--text-secondary)', fontSize: 13 }}>{message}</p>}
        </section>

        {/* ── Right: live-style preview ── */}
        <section className="hero-panel" style={{ padding: 18, minHeight: 360 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ color: 'var(--text-faint)', fontSize: 12, fontWeight: 900, letterSpacing: '.08em', textTransform: 'uppercase' }}>{tr('operator.preview.liveLabel', 'Live preview')}</div>
            {content && (
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                {content.theme === 'dark' ? `🌙 ${tr('operator.preview.dark', 'dark')}` : `☀️ ${tr('operator.preview.light', 'light')}`}
                {' · '}
                {content.sections?.length || 0} {tr('operator.preview.sections', 'sections')}
              </div>
            )}
          </div>

          {!content && !loading && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 320, color: 'var(--text-faint)', textAlign: 'center', border: '1px dashed var(--border-soft)', borderRadius: 16, padding: 24 }}>
              <div>
                <div style={{ fontSize: 40, marginBottom: 12 }}>🎨</div>
                <div style={{ fontSize: 14 }}>{tr('operator.preview.empty', 'Your designed website will appear here.')}</div>
              </div>
            </div>
          )}

          {loading && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 320, color: 'var(--text-muted)' }}>
              ✨ {tr('operator.preview.loading', 'Designing your website…')}
            </div>
          )}

          {content && <SitePreview content={content} />}
        </section>
      </div>

      <style>{`
        @media (max-width: 860px) {
          .sb-operator-grid { grid-template-columns: 1fr !important; }
          .sb-operator-grid > section:first-child { position: static !important; }
        }
      `}</style>
    </main>
  )
}
