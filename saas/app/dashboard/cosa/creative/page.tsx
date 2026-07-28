'use client'

import { LocalizedText } from '@/components/i18n/LocalizedText'

import { useEffect, useState } from 'react'
import { uiCopy } from '@/lib/i18n/generatedUiCopy'


const GOLD = '#ffc300'

type Strategy = {
  niche: string
  hero_name: string
  hero_problem: string
  emotional_hook: string
  opening_line: string
  story_arc: string[]
  proof_moment: string
  traffic_goal: string
  destination_url: string
  monetization_paths: string[]
  short_video_angles: string[]
  approval_gates: string[]
  languages: string[]
}

export default function CosaCreativeStrategyPage() {
  const [strategy, setStrategy] = useState<Strategy | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function loadStrategy() {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/cos/creative-strategy', { cache: 'no-store' })
      const json = await res.json()
      if (!json.ok) throw new Error(json.error || 'Unable to load creative strategy')
      setStrategy(json.strategy)
    } catch (err: any) {
      setError(err?.message || uiCopy('u_ff652b9ea812f8d3'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadStrategy() }, [])

  return (
    <main style={{ maxWidth: 1180, margin: '0 auto', display: 'grid', gap: 18 }}>
      <section style={heroCard}>
        <p className="sb-eyebrow" style={{ margin: 0 }}>{uiCopy('u_3afb3686c0ffdb60')}</p>
        <h1 style={{ color: '#fff', margin: '8px 0 0', fontSize: 34, letterSpacing: '-0.04em' }}>{uiCopy('u_aeb0ae1a9dcc815a')}</h1>
        <p style={{ color: 'rgba(255,255,255,.68)', lineHeight: 1.7, maxWidth: 820 }}><LocalizedText fallback={uiCopy('u_91c0f97cb0c70c94')} /></p>
        <button onClick={loadStrategy} disabled={loading} style={primaryButton}>{loading ? uiCopy('u_57051701fcaf7df0') : uiCopy('u_9d6a1beeafb42d65')}</button>
      </section>

      {error && <div style={errorCard}>{error}</div>}

      {strategy && (
        <>
          <section style={gridTwo}>
            <Panel title={uiCopy('u_29b2c429d2a8c1fc')} value={strategy.niche} />
            <Panel title={uiCopy('u_1ea35b49c85b0575')} value={strategy.hero_name} />
            <Panel title={uiCopy('u_99c5fb6d169a2417')} value={strategy.hero_problem} />
            <Panel title={uiCopy('u_8d90e03fc29e1281')} value={strategy.emotional_hook} />
          </section>

          <section style={panel}>
            <p className="sb-eyebrow" style={{ margin: 0 }}><LocalizedText fallback={uiCopy('u_f97bb710e2055e57')} /></p>
            <h2 style={{ color: '#fff', fontSize: 26, margin: '10px 0 0', lineHeight: 1.2 }}>{strategy.opening_line}</h2>
            <p style={{ color: GOLD, fontWeight: 950, margin: '14px 0 0' }}>{uiCopy('u_b844986cef3295d6')}{strategy.destination_url}</p>
          </section>

          <section style={gridTwo}>
            <ListPanel title={uiCopy('u_88421301d268633f')} items={strategy.story_arc} />
            <ListPanel title={uiCopy('u_1055cf90e422f066')} items={strategy.short_video_angles} />
            <ListPanel title={uiCopy('u_5e71c3dbfd852c04')} items={strategy.monetization_paths} />
            <ListPanel title={uiCopy('u_0c4901f88b2ef591')} items={strategy.approval_gates} />
          </section>

          <section style={panel}>
            <p className="sb-eyebrow" style={{ margin: 0 }}><LocalizedText fallback={uiCopy('u_2005e9c093e8a6ae')} /></p>
            <p style={{ color: 'rgba(255,255,255,.8)', lineHeight: 1.7, margin: '10px 0 0' }}>{strategy.proof_moment}</p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
              {strategy.languages.map((language) => <span key={language} style={pill}>{language.toUpperCase()}</span>)}
            </div>
          </section>
        </>
      )}
    </main>
  )
}

function Panel({ title, value }: { title: string; value: string }) {
  return <section style={panel}><p className="sb-eyebrow" style={{ margin: 0 }}>{title}</p><p style={{ color: '#fff', lineHeight: 1.65, margin: '10px 0 0' }}>{value}</p></section>
}

function ListPanel({ title, items }: { title: string; items: string[] }) {
  return (
    <section style={panel}>
      <p className="sb-eyebrow" style={{ margin: 0 }}>{title}</p>
      <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
        {items.map((item, index) => <div key={`${title}-${index}`} style={listItem}>{item}</div>)}
      </div>
    </section>
  )
}

const heroCard: React.CSSProperties = { border: '1px solid rgba(255,195,0,.22)', borderRadius: 24, padding: 24, background: 'linear-gradient(145deg, rgba(15,23,42,.94), rgba(2,6,23,.98))' }
const gridTwo: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }
const panel: React.CSSProperties = { border: '1px solid rgba(255,255,255,.09)', borderRadius: 18, padding: 18, background: 'rgba(15,23,42,.72)' }
const listItem: React.CSSProperties = { color: 'rgba(255,255,255,.78)', border: '1px solid rgba(255,255,255,.08)', borderRadius: 12, padding: 10, background: 'rgba(0,0,0,.18)', lineHeight: 1.55 }
const errorCard: React.CSSProperties = { border: '1px solid rgba(255,80,80,.35)', borderRadius: 16, padding: 14, color: '#fecaca', background: 'rgba(127,29,29,.22)' }
const pill: React.CSSProperties = { color: '#fff', border: '1px solid rgba(255,255,255,.12)', borderRadius: 999, padding: '8px 11px', fontWeight: 850 }
const primaryButton: React.CSSProperties = { border: 'none', background: GOLD, color: '#000', borderRadius: 12, padding: '10px 14px', fontWeight: 950, cursor: 'pointer' }
