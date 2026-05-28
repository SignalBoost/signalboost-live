'use client'

// saas/app/dashboard/operator/page.tsx — streaming version
// Reads NDJSON chunks from /api/sites/generate and shows live progress updates
// while the site is being built, then renders the preview the moment it arrives.

import { useState } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'
import { t } from '@/lib/i18n/t'
import SitePreview, { type SitePreviewContent } from '@/components/operator/SitePreview'

type StatusStep = {
  step:    string
  message: string
  items?:  string[]
}

export default function OperatorPage() {
  const { dict, lang } = useI18n()
  const tr = (key: string, fallback: string) => t(dict, key, fallback)

  const [request, setRequest]       = useState('')
  const [content, setContent]       = useState<SitePreviewContent | null>(null)
  const [liveUrl, setLiveUrl]       = useState<string | null>(null)
  const [loading, setLoading]       = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [message, setMessage]       = useState('')
  const [steps, setSteps]           = useState<StatusStep[]>([])
  const [preprocessor, setPreprocessor] = useState<any | null>(null)

  // ── Streaming generate ────────────────────────────────────────────────────
  async function generate() {
    setLoading(true)
    setMessage('')
    setLiveUrl(null)
    setContent(null)
    setSteps([])
    setPreprocessor(null)

    try {
      const res = await fetch('/api/sites/generate', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ description: request, language: lang }),
      })

      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({}))
        setMessage(err.error || tr('operator.errors.plan', 'Could not generate the website.'))
        setLoading(false)
        return
      }

      // Read the NDJSON stream
      const reader  = res.body.getReader()
      const decoder = new TextDecoder()
      let   buffer  = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })

        // Process all complete lines in the buffer
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? '' // keep incomplete last line

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed) continue

          let chunk: any
          try { chunk = JSON.parse(trimmed) } catch { continue }

          if (chunk.type === 'status') {
            setSteps(prev => [...prev, { step: chunk.step, message: chunk.message, items: chunk.items }])
          } else if (chunk.type === 'result') {
            if (chunk.content) {
              setContent(chunk.content)
            }
            if (chunk.preprocessor) {
              setPreprocessor(chunk.preprocessor)
            }
            if (chunk.error && !chunk.content) {
              setMessage(chunk.error)
            }
          }
        }
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
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ content, language: lang }),
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
    setContent(null); setLiveUrl(null); setMessage('')
    setRequest(''); setLoading(false); setPublishing(false)
    setSteps([]); setPreprocessor(null)
  }

  const fullUrl     = liveUrl ? `${typeof window !== 'undefined' ? window.location.origin : ''}${liveUrl}` : null
  const placeholder = tr('operator.input.placeholder', 'e.g. A cozy Italian restaurant in São Paulo with a menu, our story, and a reservation button')

  return (
    <main className="sb-page" style={{ maxWidth: 1240 }}>
      <div
        style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 440px) 1fr', gap: 24, alignItems: 'start' }}
        className="sb-operator-grid"
      >
        {/* ── Left: input ── */}
        <section className="hero-panel" style={{ padding: 24, position: 'sticky', top: 16 }}>
          <div className="sb-kicker">🤖 {tr('operator.title.kicker', 'AI Website Operator')}</div>
          <h1 className="sb-title" style={{ marginBottom: 8, fontSize: 28 }}>
            {tr('operator.title.main', 'Describe your website')}
          </h1>
          <p className="sb-subtitle" style={{ marginTop: 0 }}>
            {tr('operator.title.subtitle', 'Tell me about your business. I will design a complete website — and you can publish it live in one click.')}
          </p>

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

          {/* ── Live status stream ── */}
          {loading && steps.length > 0 && (
            <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {steps.map((step, i) => (
                <div
                  key={i}
                  style={{
                    display:    'flex',
                    flexDirection: 'column',
                    gap:        4,
                    padding:    '10px 12px',
                    borderRadius: 10,
                    background: i === steps.length - 1
                      ? 'rgba(255,195,0,0.08)'
                      : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${i === steps.length - 1 ? 'rgba(255,195,0,0.2)' : 'var(--border-soft)'}`,
                    fontSize:   13,
                    color:      i === steps.length - 1 ? '#fff' : 'var(--text-muted)',
                    transition: 'all 0.3s ease',
                  }}
                >
                  <span>{step.message}</span>
                  {step.items && step.items.length > 0 && (
                    <span style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 2 }}>
                      {step.items.join(' · ')}
                      {step.items.length < 20 ? '' : ' · …'}
                    </span>
                  )}
                </div>
              ))}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', fontSize: 13, color: 'var(--text-faint)' }}>
                <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>⏳</span>
                Working…
              </div>
            </div>
          )}

          {/* ── Publish button ── */}
          {content && !liveUrl && (
            <div style={{ marginTop: 18, paddingTop: 18, borderTop: '1px solid var(--border-soft)' }}>
              <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 0 }}>
                {tr('operator.publish.hint', 'Happy with it? Publish it to a live web address.')}
              </p>
              <button className="sb-button-primary" onClick={publish} disabled={publishing} style={{ width: '100%' }}>
                {publishing
                  ? `🚀 ${tr('operator.publish.loading', 'Publishing…')}`
                  : `🚀 ${tr('operator.publish.cta', 'Publish website')}`}
              </button>
            </div>
          )}

          {/* ── Live URL ── */}
          {liveUrl && fullUrl && (
            <div style={{ marginTop: 18, paddingTop: 18, borderTop: '1px solid var(--border-gold)' }}>
              <div style={{ color: '#fff', fontWeight: 800, marginBottom: 6 }}>
                🎉 {tr('operator.live', 'Your website is live')}
              </div>
              <a href={liveUrl} target="_blank" rel="noopener noreferrer" className="sb-button-primary"
                style={{ display: 'inline-block', wordBreak: 'break-all', width: '100%', textAlign: 'center' }}>
                {fullUrl} ↗
              </a>
            </div>
          )}

          {/* ── Preprocessor debug (collapsed) ── */}
          {preprocessor && !loading && (
            <div style={{ marginTop: 14, padding: '8px 12px', borderRadius: 10, border: '1px solid var(--border-soft)', background: 'rgba(255,255,255,.02)', fontSize: 11, color: 'var(--text-faint)' }}>
              Mode: <strong>{preprocessor.mode}</strong>
              {preprocessor.category ? ` · ${preprocessor.category}` : ''}
              {preprocessor.localCount ? ` · ${preprocessor.localCount} local items` : ''}
              {preprocessor.wikiCount  ? ` · ${preprocessor.wikiCount} wiki items`  : ''}
              {preprocessor.fallbackUsed ? ' · fallback' : ''}
            </div>
          )}

          {message && !liveUrl && (
            <p style={{ marginTop: 14, color: 'var(--text-secondary)', fontSize: 13 }}>{message}</p>
          )}
        </section>

        {/* ── Right: live preview ── */}
        <section className="hero-panel" style={{ padding: 18, minHeight: 360 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ color: 'var(--text-faint)', fontSize: 12, fontWeight: 900, letterSpacing: '.08em', textTransform: 'uppercase' }}>
              {tr('operator.preview.liveLabel', 'Live preview')}
            </div>
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

          {loading && !content && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 320, gap: 16, color: 'var(--text-muted)' }}>
              <div style={{ fontSize: 40, animation: 'pulse 2s ease-in-out infinite' }}>✨</div>
              <div style={{ fontSize: 14, textAlign: 'center' }}>
                {steps.length > 0
                  ? steps[steps.length - 1].message
                  : tr('operator.preview.loading', 'Designing your website…')}
              </div>
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
        @keyframes spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 0.5; transform: scale(1); }
          50%       { opacity: 1;   transform: scale(1.1); }
        }
      `}</style>
    </main>
  )
}
