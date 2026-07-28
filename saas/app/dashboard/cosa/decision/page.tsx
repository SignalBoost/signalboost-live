'use client'

import { LocalizedText } from '@/components/i18n/LocalizedText'

import { useEffect, useState } from 'react'
import { uiCopy } from '@/lib/i18n/generatedUiCopy'


const GOLD = '#ffc300'

type Decision = {
  recommended_hero: string
  recommended_format: string
  recommended_scene_designs: string[]
  confidence_score: number
  mining_summary: string[]
  prediction_summary: string
  creative_brief: string
  storyboard_direction: string[]
  traffic_plan: string[]
  monetization_plan: string[]
  approval_required: string[]
  created_at: string
}

export default function CosaMarketingDecisionPage() {
  const [decision, setDecision] = useState<Decision | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function loadDecision() {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/cos/marketing-decision', { cache: 'no-store' })
      const json = await res.json()
      if (!json.ok) throw new Error(json.error || 'Unable to load marketing decision')
      setDecision(json.decision)
    } catch (err: any) {
      setError(err?.message || uiCopy('u_6eac05f24a0792ca'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadDecision() }, [])

  return (
    <main style={{ maxWidth: 1180, margin: '0 auto', display: 'grid', gap: 18 }}>
      <section style={heroCard}>
        <p className="sb-eyebrow" style={{ margin: 0 }}><LocalizedText fallback={uiCopy('u_6e3be2662646e40d')} /></p>
        <h1 style={{ color: '#fff', margin: '8px 0 0', fontSize: 34, letterSpacing: '-0.04em' }}><LocalizedText fallback={uiCopy('u_c42158c01f0c8a8a')} /></h1>
        <p style={{ color: 'rgba(255,255,255,.68)', lineHeight: 1.7, maxWidth: 860 }}><LocalizedText fallback={uiCopy('u_2cfeb79987425180')} /></p>
        <button onClick={loadDecision} disabled={loading} style={primaryButton}>{loading ? uiCopy('u_866432a708be1f65') : uiCopy('u_e25629f7c9ed8343')}</button>
      </section>

      {error && <div style={errorCard}>{error}</div>}

      {decision && (
        <>
          <section style={gridThree}>
            <Metric title={uiCopy('u_94f9891cdaea7e02')} value={decision.recommended_hero} />
            <Metric title={uiCopy('u_18571a341c04c72e')} value={decision.recommended_format} />
            <Metric title={uiCopy('u_b82186a056f130da')} value={`${decision.confidence_score}%`} />
          </section>

          <section style={panel}>
            <p className="sb-eyebrow" style={{ margin: 0 }}><LocalizedText fallback={uiCopy('u_1d8599137386f818')} /></p>
            <h2 style={{ color: '#fff', fontSize: 24, lineHeight: 1.25, margin: '10px 0 0' }}>{decision.prediction_summary}</h2>
            <p style={{ color: 'rgba(255,255,255,.72)', lineHeight: 1.7 }}>{decision.creative_brief}</p>
          </section>

          <section style={gridTwo}>
            <ListPanel title={uiCopy('u_aa92207f5bc1d606')} items={decision.mining_summary} />
            <ListPanel title={uiCopy('u_34b0472bffda3063')} items={decision.recommended_scene_designs} />
            <ListPanel title={uiCopy('u_312a3bf8dd956e86')} items={decision.storyboard_direction} />
            <ListPanel title={uiCopy('u_1196303899e31e37')} items={decision.traffic_plan} />
            <ListPanel title={uiCopy('u_162259bb5a468c8c')} items={decision.monetization_plan} />
            <ListPanel title={uiCopy('u_faae02eb70c24a74')} items={decision.approval_required} />
          </section>
        </>
      )}
    </main>
  )
}

function Metric({ title, value }: { title: string; value: string }) {
  return (
    <section style={panel}>
      <p className="sb-eyebrow" style={{ margin: 0 }}>{title}</p>
      <h2 style={{ color: GOLD, margin: '8px 0 0', fontSize: 22 }}>{value.replaceAll('_', ' ')}</h2>
    </section>
  )
}

function ListPanel({ title, items }: { title: string; items: string[] }) {
  return (
    <section style={panel}>
      <p className="sb-eyebrow" style={{ margin: 0 }}>{title}</p>
      <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
        {items.map((item, index) => <div key={`${title}-${index}`} style={listItem}>{item.replaceAll('_', ' ')}</div>)}
      </div>
    </section>
  )
}

const heroCard: React.CSSProperties = { border: '1px solid rgba(255,195,0,.22)', borderRadius: 24, padding: 24, background: 'linear-gradient(145deg, rgba(15,23,42,.94), rgba(2,6,23,.98))' }
const gridThree: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }
const gridTwo: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 14 }
const panel: React.CSSProperties = { border: '1px solid rgba(255,255,255,.09)', borderRadius: 18, padding: 18, background: 'rgba(15,23,42,.72)' }
const listItem: React.CSSProperties = { color: 'rgba(255,255,255,.78)', border: '1px solid rgba(255,255,255,.08)', borderRadius: 12, padding: 10, background: 'rgba(0,0,0,.18)', lineHeight: 1.55 }
const errorCard: React.CSSProperties = { border: '1px solid rgba(255,80,80,.35)', borderRadius: 16, padding: 14, color: '#fecaca', background: 'rgba(127,29,29,.22)' }
const primaryButton: React.CSSProperties = { border: 'none', background: GOLD, color: '#000', borderRadius: 12, padding: '10px 14px', fontWeight: 950, cursor: 'pointer' }
