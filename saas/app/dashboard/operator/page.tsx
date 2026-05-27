'use client'

import { useEffect, useState } from 'react'
import { useTranslation } from '@/components/i18n/useTranslation'
import SitePreview, { type SitePreviewContent } from '@/components/operator/SitePreview'
import ResetButton from '@/components/ResetButton'

export default function OperatorPage() {
  const { t, lang } = useTranslation()
  const defaultRequest = t('operator.input.defaultRequest', 'A rooftop cocktail bar in Rio with bottle service and DJ nights')
  const [request, setRequest] = useState(defaultRequest)
  const [content, setContent] = useState<SitePreviewContent | null>(null)
  const [liveUrl, setLiveUrl] = useState<string | null>(null)
  const [planId, setPlanId] = useState<string | null>(null)
  const [jobId, setJobId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [message, setMessage] = useState('')
  const [requestEdited, setRequestEdited] = useState(false)

  useEffect(() => {
    if (!requestEdited) setRequest(defaultRequest)
  }, [defaultRequest, requestEdited])

  async function generate() {
    setLoading(true); setMessage(''); setLiveUrl(null); setContent(null); setJobId(null)
    try {
      const res = await fetch('/api/operator/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ request, language: lang }),
      })
      const data = await res.json()
      if (!res.ok) setMessage(data.error || t('operator.errors.plan', 'Could not generate the plan.'))
      else { setPlanId(data.plan?.id || null); setContent({
        businessName: t('operator.preview.businessName', 'Operator Plan'),
        headline: data.plan?.summary || t('operator.preview.headlineFallback', 'Planned update'),
        subheadline: data.plan?.steps?.map((s: any) => `• ${s.title}`).join('\n') || '',
        ctaText: t('operator.preview.cta', 'Approve update'),
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
      setMessage(t('operator.errors.connect', 'Could not connect. Please try again.'))
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
      if (!res.ok) setMessage(data.error || t('operator.errors.publish', 'Could not publish the website.'))
      else { setJobId(data.job?.id || null); setLiveUrl('/dashboard/operator'); setMessage(data.userMessage || t('operator.success.published', 'Update published.')) }
    } catch {
      setMessage(t('operator.errors.connect', 'Could not connect. Please try again.'))
    } finally {
      setPublishing(false)
    }
  }

  function reset() {
    setContent(null); setLiveUrl(null); setMessage(''); setRequest(defaultRequest); setLoading(false); setPublishing(false); setJobId(null); setPlanId(null); setRequestEdited(false)
  }

  const fullUrl = liveUrl ? `${typeof window !== 'undefined' ? window.location.origin : ''}${liveUrl}` : null

  return (
    <main className="sb-page" style={{ maxWidth: 1240 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 440px) 1fr', gap: 24, alignItems: 'start' }} className="sb-operator-grid">

        {/* ── Left: input ── */}
        <section className="hero-panel" style={{ padding: 24, position: 'sticky', top: 16 }}>
          <div className="sb-kicker">🤖 {t('operator.title.kicker', 'AI Website Operator')}</div>
          <h1 className="sb-title" style={{ marginBottom: 8, fontSize: 28 }}>{t('operator.title.main', 'Describe your website')}</h1>
          <p className="sb-subtitle" style={{ marginTop: 0 }}>{t('operator.title.subtitle', 'Tell me about your business. I will design a complete website — and you can publish it live in one click.')}</p>

          <textarea
            value={request}
            onChange={(e) => { setRequestEdited(true); setRequest(e.target.value) }}
            rows={5}
            placeholder={t('operator.input.placeholder', 'e.g. A cozy Italian restaurant in São Paulo with a menu, our story, and a reservation button')}
            style={{ width: '100%', marginTop: 14, borderRadius: 14, border: '1px solid var(--border-soft)', background: 'rgba(255,255,255,.02)', color: '#fff', padding: 12, fontSize: 14, lineHeight: 1.5, resize: 'vertical' }}
          />

          <div style={{ marginTop: 14, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button className="sb-button-primary" onClick={generate} disabled={loading || !request.trim()}>
              {loading ? t('operator.cta.designing', '✨ Designing…') : content ? t('operator.cta.regenerate', '↻ Regenerate') : t('operator.cta.design', '✨ Design my website')}
            </button>
            {(content || liveUrl || request) && (
              <ResetButton onReset={reset} className="sb-button-ghost" />
            )}
          </div>

          {content && !liveUrl && (
            <div style={{ marginTop: 18, paddingTop: 18, borderTop: '1px solid var(--border-soft)' }}>
              <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 0 }}>{t('operator.publish.hint', 'Happy with it? Publish it to a live web address.')}</p>
              <button className="sb-button-primary" onClick={publish} disabled={publishing} style={{ width: '100%' }}>
                {publishing ? t('operator.publish.loading', '🚀 Publishing…') : t('operator.publish.cta', '🚀 Publish website')}
              </button>
            </div>
          )}

          {liveUrl && fullUrl && (
            <div style={{ marginTop: 18, paddingTop: 18, borderTop: '1px solid var(--border-gold)' }}>
              <div style={{ color: '#fff', fontWeight: 800, marginBottom: 6 }}>{t('operator.live', '🎉 Your website is live')}</div>
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
            <div style={{ color: 'var(--text-faint)', fontSize: 12, fontWeight: 900, letterSpacing: '.08em', textTransform: 'uppercase' }}>{t('operator.preview.liveLabel', 'Live preview')}</div>
            {content && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{content.theme === 'dark' ? `🌙 ${t('operator.preview.dark', 'dark')}` : `☀️ ${t('operator.preview.light', 'light')}`} · {content.sections?.length || 0} {t('operator.preview.sections', 'sections')}</div>}
          </div>

          {!content && !loading && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 320, color: 'var(--text-faint)', textAlign: 'center', border: '1px dashed var(--border-soft)', borderRadius: 16, padding: 24 }}>
              <div>
                <div style={{ fontSize: 40, marginBottom: 12 }}>🎨</div>
                <div style={{ fontSize: 14 }}>{t('operator.preview.empty', 'Your designed website will appear here.')}</div>
              </div>
            </div>
          )}

          {loading && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 320, color: 'var(--text-muted)' }}>
              ✨ {t('operator.preview.loading', 'Designing your website…')}
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
