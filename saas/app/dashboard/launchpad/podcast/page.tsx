'use client'

import { LocalizedText } from '@/components/i18n/LocalizedText'

import { useState } from 'react'
import { EnterpriseLaunchpadConfigurator, type LaunchpadApprovalPackage } from '@/components/enterprise/EnterpriseLaunchpadConfigurator'
import { uiText } from '@/lib/i18n/uiText'

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
      setError(value instanceof Error ? value.message : "Could not generate the podcast launch package.")
    } finally {
      setLoading(false)
    }
  }

  return <main className="sb-hmi-shell" style={{ minHeight: '100vh' }}>
    <div style={{ maxWidth: 920, margin: '0 auto', paddingBottom: 80, display: 'grid', gap: 18 }}>
      <header className="sb-cockpit-hero">
        <p className="sb-hmi-kicker">{uiText('generatedUi.u_838f66d363a1bf9c')}</p>
        <h1 className="sb-h2" style={{ margin: '10px 0 12px' }}><LocalizedText fallback={uiText('generatedUi.u_4f624907560c7be4')} /></h1>
        <p className="sb-hmi-muted"><LocalizedText fallback={uiText('generatedUi.u_7c079678fc485c78')} /></p>
      </header>
      <EnterpriseLaunchpadConfigurator workspace="podcast" busy={loading} onApprove={approveAndGenerate} />
      {error && <p role="alert" style={{ color: '#fca5a5', margin: 0 }}>{error}</p>}
      {sketch && <div aria-live="polite" style={{ display: 'grid', gap: 14 }}>
        <Card title={uiText('generatedUi.u_f45d49a6618c5457')} items={sketch.showNames} />
        <Card title={uiText('generatedUi.u_5ab44798d721b744')} text={sketch.showDescription} />
        <Card title={uiText('generatedUi.u_87a3625f274a44f9')} text={sketch.targetAudience} />
        <Card title={uiText('generatedUi.u_db20897857dacf9f')} items={sketch.firstEpisodes} />
        <Card title={uiText('generatedUi.u_75d12cd29c00c023')} text={sketch.introScript} />
        <Card title={uiText('generatedUi.u_631a3ff7769daf2b')} items={sketch.launchChecklist} />
        <Card title={uiText('generatedUi.u_25cca0c30b1d14e7')} text={sketch.nextStep} />
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button type="button" className="sb-button-secondary" onClick={() => { window.location.href = '/dashboard/podcast' }}><LocalizedText fallback={uiText('generatedUi.u_e796a0e7ba210ef7')} /></button>
          <button type="button" className="sb-button-secondary" onClick={() => { window.location.href = '/dashboard/podcast/studio' }}><LocalizedText fallback={uiText('generatedUi.u_ec3aeb704e0b0479')} /></button>
        </div>
      </div>}
    </div>
  </main>
}
