'use client'

import { useEffect, useState } from 'react'

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
      setError(err?.message || 'Unable to load marketing decision')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadDecision() }, [])

  return (
    <main style={{ maxWidth: 1180, margin: '0 auto', display: 'grid', gap: 18 }}>
      <section style={heroCard}>
        <p className="sb-eyebrow" style={{ margin: 0 }}>COSA marketing decision engine</p>
        <h1 style={{ color: '#fff', margin: '8px 0 0', fontSize: 34, letterSpacing: '-0.04em' }}>COSA chooses the hero, format, storyboard, traffic path, and monetization path</h1>
        <p style={{ color: 'rgba(255,255,255,.68)', lineHeight: 1.7, maxWidth: 860 }}>
          The owner should not have to choose the creative direction. COSA should use mined signals, prediction rules, and marketing logic to recommend the strongest direction before rendering.
        </p>
        <button onClick={loadDecision} disabled={loading} style={primaryButton}>{loading ? 'Loading...' : 'Refresh COSA decision'}</button>
      </section>

      {error && <div style={errorCard}>{error}</div>}

      {decision && (
        <>
          <section style={gridThree}>
            <Metric title="Hero" value={decision.recommended_hero} />
            <Metric title="Format" value={decision.recommended_format} />
            <Metric title="Confidence" value={`${decision.confidence_score}%`} />
          </section>

          <section style={panel}>
            <p className="sb-eyebrow" style={{ margin: 0 }}>Prediction summary</p>
            <h2 style={{ color: '#fff', fontSize: 24, lineHeight: 1.25, margin: '10px 0 0' }}>{decision.prediction_summary}</h2>
            <p style={{ color: 'rgba(255,255,255,.72)', lineHeight: 1.7 }}>{decision.creative_brief}</p>
          </section>

          <section style={gridTwo}>
            <ListPanel title="Mined signals" items={decision.mining_summary} />
            <ListPanel title="Scene design" items={decision.recommended_scene_designs} />
            <ListPanel title="Storyboard direction" items={decision.storyboard_direction} />
            <ListPanel title="Traffic plan" items={decision.traffic_plan} />
            <ListPanel title="Monetization plan" items={decision.monetization_plan} />
            <ListPanel title="Approval gates" items={decision.approval_required} />
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
