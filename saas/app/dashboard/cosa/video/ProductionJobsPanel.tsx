'use client'

import { useEffect, useState } from 'react'
import { useTranslation } from '@/components/i18n/useTranslation'
import { getVideoProductionCopy } from '@/lib/cos/i18n/videoProductionCopy'

const GOLD = '#ffc300'

type Job = {
  id: string
  title: string
  status: string
  production_tier: string
  hook?: string
  platforms?: string[]
  signed_output_url?: string | null
  error?: string | null
  approval_state?: Record<string, boolean>
}

export function ProductionJobsPanel() {
  const { lang } = useTranslation()
  const copy = getVideoProductionCopy(lang)
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  async function loadJobs() {
    setLoading(true)
    setMessage('')
    try {
      const res = await fetch('/api/cos/video-production', { cache: 'no-store' })
      const json = await res.json()
      if (!json.ok) throw new Error(json.error || 'load failed')
      setJobs(Array.isArray(json.jobs) ? json.jobs : [])
      if (json.warning) setMessage(json.warning)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'load failed')
    } finally {
      setLoading(false)
    }
  }

  async function decide(job: Job, approved: boolean) {
    const approval_state = { ...(job.approval_state || {}), render_approved: approved, publish_approved: false }
    await fetch('/api/cos/video-production', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: job.id, status: approved ? 'approved' : 'rejected', approval_state }),
    })
    await loadJobs()
  }

  useEffect(() => { loadJobs() }, [])

  return (
    <section style={panel}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <p className="sb-eyebrow" style={{ margin: 0 }}>{copy.title}</p>
          <p style={{ color: 'rgba(255,255,255,.68)', lineHeight: 1.65, margin: '8px 0 0' }}>{copy.intro}</p>
        </div>
        <button onClick={loadJobs} disabled={loading} style={secondary}>{loading ? '...' : copy.refresh}</button>
      </div>

      {message && <p style={{ color: GOLD, margin: '12px 0 0', fontSize: 13 }}>{message}</p>}
      {jobs.length === 0 && <p style={{ color: 'rgba(255,255,255,.5)', margin: '14px 0 0' }}>{copy.empty}</p>}

      <div style={{ display: 'grid', gap: 12, marginTop: 14 }}>
        {jobs.map(job => (
          <article key={job.id} style={card}>
            <p style={{ color: GOLD, margin: 0, fontSize: 12, fontWeight: 950 }}>{copy.finalReview}</p>
            <h3 style={{ color: '#fff', margin: '6px 0 0', fontSize: 20 }}>{job.title}</h3>
            <p style={{ color: 'rgba(255,255,255,.62)', margin: '8px 0 0' }}>{job.hook}</p>
            <p style={{ color: 'rgba(255,255,255,.56)', margin: '8px 0 0', fontSize: 12 }}>{copy.status}: {job.status} · {copy.tier}: {job.production_tier} · {copy.platforms}: {(job.platforms || []).join(', ')}</p>

            {job.signed_output_url ? (
              <div style={{ marginTop: 12 }}>
                <p style={{ color: GOLD, fontWeight: 900, margin: '0 0 8px' }}>{copy.outputReady}</p>
                <video controls src={job.signed_output_url} style={{ width: '100%', borderRadius: 14, border: '1px solid rgba(255,195,0,.25)', background: '#000' }} />
                <a href={job.signed_output_url} target="_blank" rel="noreferrer" style={{ ...secondary, display: 'inline-flex', marginTop: 10, textDecoration: 'none' }}>{copy.openFile}</a>
              </div>
            ) : <p style={{ color: 'rgba(255,255,255,.5)', margin: '12px 0 0' }}>{copy.outputPending}</p>}

            {job.error && <p style={{ color: '#fca5a5', margin: '10px 0 0', fontSize: 13 }}>{copy.error}: {job.error}</p>}

            {job.status === 'rendered' && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                <button onClick={() => decide(job, false)} style={secondary}>{copy.rejectFinal}</button>
                <button onClick={() => decide(job, true)} style={primary}>{copy.approveFinal}</button>
              </div>
            )}
          </article>
        ))}
      </div>
    </section>
  )
}

const panel: React.CSSProperties = { border: '1px solid rgba(255,195,0,.18)', borderRadius: 20, padding: 18, background: 'rgba(15,23,42,.74)' }
const card: React.CSSProperties = { border: '1px solid rgba(255,255,255,.09)', borderRadius: 16, padding: 14, background: 'rgba(0,0,0,.18)' }
const primary: React.CSSProperties = { border: 'none', background: GOLD, color: '#000', borderRadius: 12, padding: '10px 14px', fontWeight: 950, cursor: 'pointer' }
const secondary: React.CSSProperties = { border: '1px solid rgba(255,255,255,.16)', background: 'rgba(255,255,255,.06)', color: '#fff', borderRadius: 12, padding: '10px 14px', fontWeight: 850, cursor: 'pointer' }
