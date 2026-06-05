'use client'

import { useMemo, useState } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'
import { t } from '@/lib/i18n/t'
import type { OptimizedMetadata, PodcastAudit, PodcastRebuild } from '@/lib/podcast/optimization'

const GOLD = '#ffc300'

type ApiState = {
  audit: PodcastAudit | null
  optimized: OptimizedMetadata | null
  rebuild: PodcastRebuild | null
}

function ScoreCard({ label, value }: { label: string; value: number }) {
  const color = value >= 80 ? '#86efac' : value >= 55 ? '#fde68a' : '#fca5a5'
  return (
    <div className="sb-card" style={{ padding: 16 }}>
      <div className="sb-caption" style={{ textTransform: 'uppercase', letterSpacing: '.08em' }}>{label}</div>
      <strong style={{ color, fontSize: 28 }}>{value}</strong><span className="sb-caption"> / 100</span>
    </div>
  )
}

export default function PodcastsPage() {
  const { dict, lang } = useI18n()
  const [feedUrl, setFeedUrl] = useState('')
  const [state, setState] = useState<ApiState>({ audit: null, optimized: null, rebuild: null })
  const [episodeId, setEpisodeId] = useState('')
  const [loading, setLoading] = useState<'analyze' | 'optimize' | 'rebuild' | null>(null)
  const [error, setError] = useState('')
  const selectedEpisode = useMemo(() => state.audit?.episodes.find(item => item.id === episodeId) || state.audit?.episodes[0], [episodeId, state.audit])

  async function call(action: 'analyze' | 'optimize' | 'rebuild') {
    if (loading) return
    setLoading(action)
    setError('')
    try {
      const res = await fetch('/api/podcast/system', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, feedUrl, audit: state.audit, episodeId: episodeId || selectedEpisode?.id, language: lang }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) throw new Error(data?.error || 'Request failed.')
      setState(prev => ({
        audit: data.audit || prev.audit,
        optimized: data.optimized || (action === 'analyze' ? null : prev.optimized),
        rebuild: data.rebuild || (action === 'analyze' ? null : prev.rebuild),
      }))
      if (data.audit?.episodes?.[0]?.id) setEpisodeId(data.audit.episodes[0].id)
    } catch (err) {
      setError(err instanceof Error ? err.message : t(dict, 'podcasts.error.generic', 'Could not process the feed.'))
    } finally {
      setLoading(null)
    }
  }

  return (
    <main style={{ padding: 24, color: '#fff', maxWidth: 1180, margin: '0 auto', display: 'grid', gap: 22 }}>
      <header>
        <span className="sb-eyebrow">{t(dict, 'podcasts.eyebrow', 'SignalBoost SaaS Station')}</span>
        <h1 className="sb-h1" style={{ marginTop: 8 }}>🎙️ {t(dict, 'podcasts.title', 'Podcast Optimization System')}</h1>
        <p className="sb-body" style={{ maxWidth: 820 }}>{t(dict, 'podcasts.subtitle', 'Analyze podcast feeds, optimize episode metadata and transcripts, rebuild modern RSS outputs, and route podcast requests through Concierge.')}</p>
      </header>

      <section className="sb-card" style={{ padding: 22 }}>
        <h2 className="sb-h2">{t(dict, 'podcasts.analyzer.title', 'Podcast Analyzer')}</h2>
        <label className="sb-caption" htmlFor="feed-url">{t(dict, 'podcasts.feed.label', 'FeedInputField')}</label>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 8 }}>
          <input id="feed-url" className="sb-input" value={feedUrl} onChange={event => setFeedUrl(event.target.value)} placeholder={t(dict, 'podcasts.feed.placeholder', 'RSS feed URL or Apple Podcasts link')} style={{ flex: 1, minWidth: 280, padding: 14 }} />
          <button className="sb-button-primary" style={{ background: GOLD, color: '#111' }} disabled={!feedUrl.trim() || loading === 'analyze'} onClick={() => call('analyze')}>{loading === 'analyze' ? t(dict, 'podcasts.analyzer.loading', 'Analyzing…') : t(dict, 'podcasts.analyzer.button', 'AnalyzeButton')}</button>
        </div>
        {error && <p className="sb-caption" style={{ color: '#fca5a5' }}>{error}</p>}
        {state.audit && (
          <div style={{ display: 'grid', gap: 16, marginTop: 18 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
              <ScoreCard label={t(dict, 'podcasts.score.audio', 'Audio')} value={state.audit.audio_quality_score} />
              <ScoreCard label={t(dict, 'podcasts.score.metadata', 'Metadata')} value={state.audit.metadata_score} />
              <ScoreCard label={t(dict, 'podcasts.score.distribution', 'Distribution')} value={state.audit.distribution_score} />
              <ScoreCard label={t(dict, 'podcasts.score.seo', 'SEO')} value={state.audit.seo_score} />
              <ScoreCard label={t(dict, 'podcasts.score.accessibility', 'Accessibility')} value={state.audit.accessibility_score} />
            </div>
            <div className="sb-card" style={{ padding: 16, background: 'rgba(255,255,255,.04)' }}>
              <strong>{t(dict, 'podcasts.audit.result', 'AuditResultView')}</strong>
              <p className="sb-body">{state.audit.show.title} · {state.audit.episodes.length} {t(dict, 'podcasts.audit.episodes', 'episodes')} · {state.audit.feed_url}</p>
              <div style={{ display: 'grid', gap: 10 }}>
                {state.audit.recommendations.map((item, index) => (
                  <article key={`${item.category}-${index}`} style={{ border: '1px solid rgba(255,255,255,.12)', borderRadius: 14, padding: 12 }}>
                    <strong>{item.category.toUpperCase()} · {item.priority}</strong>
                    <p className="sb-body" style={{ margin: '6px 0' }}>{item.recommendation}</p>
                    <code style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>{JSON.stringify(item.suggested_fix, null, 2)}</code>
                  </article>
                ))}
              </div>
            </div>
          </div>
        )}
      </section>

      <section className="sb-card" style={{ padding: 22 }}>
        <h2 className="sb-h2">{t(dict, 'podcasts.optimizer.title', 'Podcast Optimizer')}</h2>
        <label className="sb-caption" htmlFor="episode-selector">{t(dict, 'podcasts.optimizer.selector', 'EpisodeSelector')}</label>
        <select id="episode-selector" className="sb-input" value={episodeId} onChange={event => setEpisodeId(event.target.value)} disabled={!state.audit} style={{ padding: 12, marginTop: 8, width: '100%' }}>
          {(state.audit?.episodes || []).map(episode => <option key={episode.id} value={episode.id}>{episode.title}</option>)}
        </select>
        <button className="sb-button-primary" style={{ marginTop: 12 }} disabled={!state.audit || loading === 'optimize'} onClick={() => call('optimize')}>{loading === 'optimize' ? t(dict, 'podcasts.optimizer.loading', 'Optimizing…') : t(dict, 'podcasts.optimizer.button', 'Optimize metadata')}</button>
        {selectedEpisode && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14, marginTop: 16 }}>
            <div className="sb-card" style={{ padding: 16 }}>
              <strong>{t(dict, 'podcasts.optimizer.current', 'CurrentMetadataView')}</strong>
              <p>{selectedEpisode.title}</p>
              <p className="sb-body">{selectedEpisode.description || t(dict, 'podcasts.optimizer.noDescription', 'No description in feed.')}</p>
            </div>
            <div className="sb-card" style={{ padding: 16 }}>
              <strong>{t(dict, 'podcasts.optimizer.ai', 'AIOptimizedMetadataView')}</strong>
              {state.optimized ? (
                <>
                  <p>{state.optimized.title}</p>
                  <p className="sb-body">{state.optimized.description}</p>
                  <button className="sb-button-ghost" onClick={() => navigator.clipboard?.writeText(JSON.stringify(state.optimized, null, 2))}>{t(dict, 'podcasts.optimizer.apply', 'ApplyChangesButton')}</button>
                </>
              ) : <p className="sb-caption">{t(dict, 'podcasts.optimizer.empty', 'Run the optimizer to generate metadata and transcripts.')}</p>}
            </div>
          </div>
        )}
      </section>

      <section className="sb-card" style={{ padding: 22 }}>
        <h2 className="sb-h2">{t(dict, 'podcasts.rebuild.title', 'Podcast Rebuild Engine')}</h2>
        <div style={{ border: '1px solid rgba(255,195,0,.35)', borderRadius: 14, padding: 14, background: 'rgba(255,195,0,.08)' }}>{t(dict, 'podcasts.rebuild.banner', 'RebuildRecommendationBanner: Generate a Podcasting 2.0-ready RSS feed with normalized metadata and transcript payloads.')}</div>
        <button className="sb-button-primary" style={{ marginTop: 12 }} disabled={!state.audit || loading === 'rebuild'} onClick={() => call('rebuild')}>{loading === 'rebuild' ? t(dict, 'podcasts.rebuild.loading', 'Generating…') : t(dict, 'podcasts.rebuild.button', 'GenerateRebuildButton')}</button>
        {state.rebuild && (
          <div style={{ display: 'grid', gap: 12, marginTop: 16 }}>
            <strong>{t(dict, 'podcasts.rebuild.preview', 'RebuildPreview')}</strong>
            <textarea className="sb-input" readOnly value={state.rebuild.rssXml} style={{ minHeight: 260, fontFamily: 'monospace', fontSize: 12 }} />
            <button className="sb-button-ghost" onClick={() => navigator.clipboard?.writeText(JSON.stringify(state.rebuild, null, 2))}>{t(dict, 'podcasts.rebuild.export', 'ExportOptions')}</button>
          </div>
        )}
      </section>

      <footer className="sb-caption" style={{ opacity: .75 }}>{t(dict, 'podcasts.footer', 'Footer: status healthy, sync health live, JSON-safe outputs enabled.')}</footer>
    </main>
  )
}
