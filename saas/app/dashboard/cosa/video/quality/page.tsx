'use client'

import { useEffect, useState } from 'react'

const GOLD = '#ffc300'

type Score = {
  label: string
  score: number
  max_score: number
  grade: string
  passed_features: string[]
  failed_features: string[]
  notes: string[]
}

type Comparison = {
  baseline: Score
  cosa: Score
  improvement_points: number
  verdict: string
  next_actions: string[]
}

export default function CosaVideoQualityPage() {
  const [comparison, setComparison] = useState<Comparison | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function runTest() {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/cos/video-quality', { cache: 'no-store' })
      const json = await res.json()
      if (!json.ok) throw new Error(json.error || 'Unable to run quality test')
      setComparison(json.comparison)
    } catch (err: any) {
      setError(err?.message || 'Unable to run quality test')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { runTest() }, [])

  return (
    <main style={{ maxWidth: 1180, margin: '0 auto', display: 'grid', gap: 18 }}>
      <section style={heroCard}>
        <p className="sb-eyebrow" style={{ margin: 0 }}>COSA video QA</p>
        <h1 style={{ color: '#fff', margin: '8px 0 0', fontSize: 34, letterSpacing: '-0.04em' }}>Verify whether COSA produces a better video</h1>
        <p style={{ color: 'rgba(255,255,255,.68)', lineHeight: 1.7, maxWidth: 860 }}>
          This test compares a basic text-only video against a COSA decision-driven video strategy. It checks hero, format, visual motion, URL, CTA, traffic plan, monetization plan, five languages, prediction, and approval gates.
        </p>
        <button onClick={runTest} disabled={loading} style={primaryButton}>{loading ? 'Running...' : 'Run quality test'}</button>
      </section>

      {error && <div style={errorCard}>{error}</div>}

      {comparison && (
        <>
          <section style={gridTwo}>
            <ScoreCard score={comparison.baseline} />
            <ScoreCard score={comparison.cosa} />
          </section>

          <section style={panel}>
            <p className="sb-eyebrow" style={{ margin: 0 }}>Verdict</p>
            <h2 style={{ color: comparison.improvement_points > 0 ? GOLD : '#fecaca', margin: '8px 0 0', fontSize: 26 }}>{comparison.verdict}</h2>
            <p style={{ color: 'rgba(255,255,255,.72)', lineHeight: 1.7 }}>Improvement: {comparison.improvement_points} point(s)</p>
          </section>

          <section style={panel}>
            <p className="sb-eyebrow" style={{ margin: 0 }}>Next actions</p>
            <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
              {comparison.next_actions.map((action, index) => <div key={index} style={listItem}>{action}</div>)}
            </div>
          </section>
        </>
      )}
    </main>
  )
}

function ScoreCard({ score }: { score: Score }) {
  return (
    <section style={panel}>
      <p className="sb-eyebrow" style={{ margin: 0 }}>{score.label}</p>
      <h2 style={{ color: GOLD, fontSize: 32, margin: '8px 0 0' }}>{score.score}/{score.max_score}</h2>
      <p style={{ color: '#fff', fontWeight: 900, textTransform: 'capitalize', margin: '4px 0 0' }}>{score.grade.replaceAll('_', ' ')}</p>
      <div style={{ display: 'grid', gap: 10, marginTop: 14 }}>
        <FeatureList title="Passed" items={score.passed_features} good />
        <FeatureList title="Missing" items={score.failed_features} />
      </div>
    </section>
  )
}

function FeatureList({ title, items, good = false }: { title: string; items: string[]; good?: boolean }) {
  return (
    <div>
      <p style={{ color: good ? '#86efac' : '#fca5a5', fontSize: 12, fontWeight: 950, margin: 0, textTransform: 'uppercase' }}>{title}</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
        {items.length ? items.map((item) => <span key={item} style={pill}>{item.replaceAll('_', ' ')}</span>) : <span style={pill}>None</span>}
      </div>
    </div>
  )
}

const heroCard: React.CSSProperties = { border: '1px solid rgba(255,195,0,.22)', borderRadius: 24, padding: 24, background: 'linear-gradient(145deg, rgba(15,23,42,.94), rgba(2,6,23,.98))' }
const gridTwo: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 14 }
const panel: React.CSSProperties = { border: '1px solid rgba(255,255,255,.09)', borderRadius: 18, padding: 18, background: 'rgba(15,23,42,.72)' }
const listItem: React.CSSProperties = { color: 'rgba(255,255,255,.78)', border: '1px solid rgba(255,255,255,.08)', borderRadius: 12, padding: 10, background: 'rgba(0,0,0,.18)', lineHeight: 1.55 }
const pill: React.CSSProperties = { color: '#fff', border: '1px solid rgba(255,255,255,.12)', borderRadius: 999, padding: '7px 10px', fontSize: 12 }
const errorCard: React.CSSProperties = { border: '1px solid rgba(255,80,80,.35)', borderRadius: 16, padding: 14, color: '#fecaca', background: 'rgba(127,29,29,.22)' }
const primaryButton: React.CSSProperties = { border: 'none', background: GOLD, color: '#000', borderRadius: 12, padding: '10px 14px', fontWeight: 950, cursor: 'pointer' }
