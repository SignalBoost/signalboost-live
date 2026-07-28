'use client'

import { LocalizedText } from '@/components/i18n/LocalizedText'

import { useState } from 'react'
import { EnterpriseLaunchpadConfigurator, type LaunchpadApprovalPackage } from '@/components/enterprise/EnterpriseLaunchpadConfigurator'
import { uiCopy } from '@/lib/i18n/generatedUiCopy'


type Sketch = {
  showNames: string[]
  showDescription: string
  targetAudience: string
  firstEpisodes: string[]
  introScript: string
  launchChecklist: string[]
  nextStep: string
}

function Card({ title, items, text }: { title: string; items?: string[]; text?: string }) {
  return <section style={{ padding: 20, borderRadius: 20, background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.10)' }}>
    <h3 style={{ margin: '0 0 12px', fontSize: 16 }}>{title}</h3>
    {text && <p style={{ color: 'rgba(255,255,255,.7)', lineHeight: 1.7, margin: 0 }}>{text}</p>}
    {items?.map((item) => <div key={item} style={{ marginBottom: 8, color: 'rgba(255,255,255,.7)', fontSize: 14 }}>• {item}</div>)}
  </section>
}

export default function PodcastLaunchpad() {
  const [loading, setLoading] = useState(false)
  const [sketch, setSketch] = useState<Sketch | null>(null)
  const [error, setError] = useState('')

  async function approveAndGenerate(approval: LaunchpadApprovalPackage) {
    setLoading(true); setError(''); setSketch(null)
    try {
      try { localStorage.setItem('launchpad:podcast:approval', JSON.stringify(approval)) } catch {}
      const response = await fetch('/api/launchpad/podcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: `${approval.organization}. ${approval.description}. Audience: ${approval.audiences.join(', ')}. Direction: ${approval.creativeDirection}.`,
          format: approval.format,
          experience: 'enterprise',
          sourceUrl: approval.sourceUrl,
          approval,
        }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok || !payload?.sketch) throw new Error(payload?.error || 'Could not generate the podcast launch package.')
      setSketch(payload.sketch)
      try { localStorage.setItem('podcastSketch', JSON.stringify(payload.sketch)) } catch {}
    } catch (value) {
      setError(value instanceof Error ? value.message : uiCopy('u_6e8424da6905f62a'))
    } finally {
      setLoading(false)
    }
  }

  return <main className="sb-hmi-shell" style={{ minHeight: '100vh' }}>
    <div style={{ maxWidth: 920, margin: '0 auto', paddingBottom: 80, display: 'grid', gap: 18 }}>
      <header className="sb-cockpit-hero">
        <p className="sb-hmi-kicker">{uiCopy('u_4425164aa9df13a0')}</p>
        <h1 className="sb-h2" style={{ margin: '10px 0 12px' }}><LocalizedText fallback={uiCopy('u_2ab5c658c3ecbab6')} /></h1>
        <p className="sb-hmi-muted"><LocalizedText fallback={uiCopy('u_2765310aeb64cff5')} /></p>
      </header>
      <EnterpriseLaunchpadConfigurator workspace="podcast" busy={loading} onApprove={approveAndGenerate} />
      {error && <p role="alert" style={{ color: '#fca5a5', margin: 0 }}>{error}</p>}
      {sketch && <div aria-live="polite" style={{ display: 'grid', gap: 14 }}>
        <Card title={uiCopy('u_286e9bcaeae5e1e4')} items={sketch.showNames} />
        <Card title={uiCopy('u_b4dbcb10dd7c294d')} text={sketch.showDescription} />
        <Card title={uiCopy('u_194c1c805b2a6973')} text={sketch.targetAudience} />
        <Card title={uiCopy('u_def642cd096fa960')} items={sketch.firstEpisodes} />
        <Card title={uiCopy('u_526d954566dd9d58')} text={sketch.introScript} />
        <Card title={uiCopy('u_9e4f7a52643506bb')} items={sketch.launchChecklist} />
        <Card title={uiCopy('u_50260d0d28eec133')} text={sketch.nextStep} />
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button type="button" className="sb-button-secondary" onClick={() => { window.location.href = '/dashboard/podcast' }}><LocalizedText fallback={uiCopy('u_f15eddc7d2afce57')} /></button>
          <button type="button" className="sb-button-secondary" onClick={() => { window.location.href = '/dashboard/podcast/studio' }}><LocalizedText fallback={uiCopy('u_2eaedea9f0955898')} /></button>
        </div>
      </div>}
    </div>
  </main>
}
