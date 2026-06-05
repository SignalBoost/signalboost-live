'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

type Prospect = {
  id?: string | number
  business_name?: string
  name?: string
  stage?: string
  status?: string
  contact_email?: string
  notes?: string
  created_at?: string
}

const STAGES = ['discovered', 'contacted', 'replied', 'booked', 'closed'] as const
type Stage = typeof STAGES[number]

const STAGE_LABEL: Record<Stage, string> = {
  discovered: 'Discovered',
  contacted: 'Contacted',
  replied: 'Replied',
  booked: 'Booked',
  closed: 'Closed',
}

const STAGE_ACCENT: Record<Stage, string> = {
  discovered: '#7dd3fc',
  contacted: '#fde68a',
  replied: '#c4b5fd',
  booked: '#fdba74',
  closed: '#86efac',
}

function toStage(p: Prospect): Stage {
  const raw = String(p.stage || p.status || '').toLowerCase()
  return (STAGES.find(s => raw.includes(s)) as Stage) || 'discovered'
}

export default function OutreachPipelinePage() {
  const [prospects, setProspects] = useState<Prospect[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const res = await fetch('/api/sales/pipeline', { cache: 'no-store' })
        const data = await res.json()
        if (!active) return
        if (data?.error && (!data.leads || data.leads.length === 0)) {
          setError(data.error)
        }
        setProspects(Array.isArray(data.leads) ? data.leads : [])
      } catch {
        if (active) setError('Could not load the pipeline.')
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => { active = false }
  }, [])

  const byStage = (stage: Stage) => prospects.filter(p => toStage(p) === stage)

  return (
    <main className="sb-glass" style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 20 }}>
        <div>
          <span className="sb-eyebrow">Pipeline</span>
          <h1 className="sb-h2" style={{ marginTop: 10 }}>Every lead, by stage.</h1>
          <p className="sb-body" style={{ maxWidth: 600 }}>Track prospects from first discovery through to a closed deal.</p>
        </div>
        <Link className="sb-button-primary" href="/dashboard/outreach/discovery">+ Discover new lead</Link>
      </div>

      {loading && <p className="sb-body">Loading pipeline…</p>}
      {error && !loading && (
        <p className="sb-caption" style={{ color: '#fca5a5', marginBottom: 16 }}>{error}</p>
      )}

      {!loading && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(180px, 1fr))', gap: 12, overflowX: 'auto' }}>
          {STAGES.map(stage => {
            const items = byStage(stage)
            return (
              <section key={stage} style={{ minWidth: 180 }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  borderTop: `3px solid ${STAGE_ACCENT[stage]}`,
                  paddingTop: 8,
                  marginBottom: 10,
                }}>
                  <h2 className="sb-eyebrow" style={{ margin: 0 }}>{STAGE_LABEL[stage]}</h2>
                  <span className="sb-caption" style={{ color: STAGE_ACCENT[stage] }}>{items.length}</span>
                </div>

                <div style={{ display: 'grid', gap: 10 }}>
                  {items.map((p, i) => (
                    <article key={p.id ?? `${stage}-${i}`} className="sb-card" style={{ padding: 14 }}>
                      <strong style={{ color: '#fff', display: 'block' }}>
                        {p.business_name || p.name || 'Unnamed'}
                      </strong>
                      {p.contact_email && (
                        <span className="sb-caption" style={{ display: 'block', marginTop: 4 }}>{p.contact_email}</span>
                      )}
                      {p.notes && (
                        <p className="sb-body" style={{ fontSize: 13, margin: '8px 0 0' }}>{p.notes}</p>
                      )}
                    </article>
                  ))}
                  {items.length === 0 && (
                    <p className="sb-caption" style={{ opacity: 0.5 }}>—</p>
                  )}
                </div>
              </section>
            )
          })}
        </div>
      )}
    </main>
  )
}
