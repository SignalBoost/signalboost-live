'use client'

import { useState } from 'react'
import SitePreview, { type SitePreviewContent } from '@/components/operator/SitePreview'

export default function OperatorPage() {
  const [request, setRequest] = useState('A high-end rooftop cocktail bar in Rio with bottle service and DJ nights')
  const [content, setContent] = useState<SitePreviewContent | null>(null)
  const [liveUrl, setLiveUrl] = useState<string | null>(null)
  const [planId, setPlanId] = useState<string | null>(null)
  const [jobId, setJobId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [message, setMessage] = useState('')

  async function generate() {
    setLoading(true); setMessage(''); setLiveUrl(null); setContent(null)
    try {
      const res = await fetch('/api/operator/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ request }),
      })
      const data = await res.json()
      if (!res.ok) setMessage(data.error || 'Could not generate the plan.')
      else { setPlanId(data.plan?.id || null); setContent({
        businessName: 'Operator Plan',
        headline: data.plan?.summary || 'Planned update',
        subheadline: data.plan?.steps?.map((s: any) => `• ${s.title}`).join('\n') || '',
        ctaText: 'Approve update',
        sections: (data.plan?.steps || []).map((step: any, i: number) => ({
          id: String(i),
          type: 'features',
          title: step.title,
          body: step.description || '',
          bullets: step.files || [],
        })),
        theme: 'dark',
      } as any) }
    } catch {
      setMessage('Could not connect. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  async function publish() {
    if (!content) return
    setPublishing(true); setMessage('')
    try {
      const res = await fetch('/api/operator/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId, approved: true }),
      })
      const data = await res.json()
      if (!res.ok) setMessage(data.error || 'Could not publish the website.')
      else { setJobId(data.job?.id || null); setLiveUrl('/dashboard/operator'); setMessage(data.userMessage || 'Update published.') }
    } catch {
      setMessage('Could not connect. Please try again.')
    } finally {
      setPublishing(false)
    }
  }

  function reset() {
    setContent(null); setLiveUrl(null); setMessage(''); setRequest('')
  }

  const fullUrl = liveUrl ? `${typeof window !== 'undefined' ? window.location.origin : ''}${liveUrl}` : null

  return (
    <main className="sb-page" style={{ maxWidth: 1240 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 440px) 1fr', gap: 24, alignItems: 'start' }} className="sb-operator-grid">

        {/* ── Left: input ── */}
        <section className="hero-panel" style={{ padding: 24, position: 'sticky', top: 16 }}>
          <div className="sb-kicker">🤖 AI Website Operator</div>
          <h1 className="sb-title" style={{ marginBottom: 8, fontSize: 28 }}>Describe your website</h1>
          <p className="sb-subtitle" style={{ marginTop: 0 }}>Tell me about your business. I will design a complete website — and you can publish it live in one click.</p>

          <textarea
            value={request}
            onChange={(e) => setRequest(e.target.value)}
            rows={5}
            placeholder="e.g. A cozy Italian restaurant in São Paulo with a menu, our story, and a reservation button"
            style={{ width: '100%', marginTop: 14, borderRadius: 14, border: '1px solid var(--border-soft)', background: 'rgba(255,255,255,.02)', color: '#fff', padding: 12, fontSize: 14, lineHeight: 1.5, resize: 'vertical' }}
          />

          <div style={{ marginTop: 14, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button className="sb-button-primary" onClick={generate} disabled={loading || !request.trim()}>
              {loading ? '✨ Designing…' : content ? '↻ Regenerate' : '✨ Design my website'}
            </button>
            {(content || liveUrl || request) && (
              <button className="sb-button-ghost" onClick={reset} disabled={loading || publishing}>
                Start over
              </button>
            )}
          </div>

          {content && !liveUrl && (
            <div style={{ marginTop: 18, paddingTop: 18, borderTop: '1px solid var(--border-soft)' }}>
              <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 0 }}>Happy with it? Publish it to a live web address.</p>
              <button className="sb-button-primary" onClick={publish} disabled={publishing} style={{ width: '100%' }}>
                {publishing ? '🚀 Publishing…' : '🚀 Publish website'}
              </button>
            </div>
          )}

          {liveUrl && fullUrl && (
            <div style={{ marginTop: 18, paddingTop: 18, borderTop: '1px solid var(--border-gold)' }}>
              <div style={{ color: '#fff', fontWeight: 800, marginBottom: 6 }}>🎉 Your website is live</div>
              <a href={liveUrl} target="_blank" rel="noopener noreferrer" className="sb-button-primary" style={{ display: 'inline-block', wordBreak: 'break-all', width: '100%', textAlign: 'center' }}>
                {fullUrl} ↗
              </a>
            </div>
          )}

          {message && !liveUrl && <p style={{ marginTop: 14, color: 'var(--text-secondary)', fontSize: 13 }}>{message}</p>}
        </section>

        {/* ── Right: live-style preview ── */}
        <section className="hero-panel" style={{ padding: 18, minHeight: 360 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ color: 'var(--text-faint)', fontSize: 12, fontWeight: 900, letterSpacing: '.08em', textTransform: 'uppercase' }}>Live preview</div>
            {content && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{content.theme === 'dark' ? '🌙 dark' : '☀️ light'} · {content.sections?.length || 0} sections</div>}
          </div>

          {!content && !loading && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 320, color: 'var(--text-faint)', textAlign: 'center', border: '1px dashed var(--border-soft)', borderRadius: 16, padding: 24 }}>
              <div>
                <div style={{ fontSize: 40, marginBottom: 12 }}>🎨</div>
                <div style={{ fontSize: 14 }}>Your designed website will appear here.</div>
              </div>
            </div>
          )}

          {loading && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 320, color: 'var(--text-muted)' }}>
              ✨ Designing your website…
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
