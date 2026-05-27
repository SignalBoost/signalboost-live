'use client'

import { useState } from 'react'

type Plan = {
  id: string
  request: string
  clarificationQuestion?: string
  summary: string
  steps: string[]
  fileTargets: string[]
  preview: string[]
  requiresApproval: boolean
}

type Job = {
  id: string
  state: string
  publishMessage: string
  rollbackAvailable: boolean
}

export default function OperatorPage() {
  const [request, setRequest] = useState('Make my restaurant website look more elegant and add a reservation button')
  const [plan, setPlan] = useState<Plan | null>(null)
  const [job, setJob] = useState<Job | null>(null)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  async function createPlan() {
    setLoading(true)
    setMessage('')
    const res = await fetch('/api/operator/plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ request }),
    })
    const data = await res.json()
    setLoading(false)
    if (!res.ok) return setMessage(data.error || 'Could not create plan.')
    setPlan(data.plan)
  }

  async function approveAndPublish() {
    if (!plan) return
    setLoading(true)
    const res = await fetch('/api/operator/apply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ planId: plan.id, approved: true }),
    })
    const data = await res.json()
    setLoading(false)
    if (!res.ok) return setMessage(data.error || 'Could not apply.')
    setJob(data.job)
    setMessage(data.userMessage || '')
  }

  async function rollback() {
    if (!job) return
    setLoading(true)
    const res = await fetch('/api/operator/rollback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobId: job.id }),
    })
    const data = await res.json()
    setLoading(false)
    if (!res.ok) return setMessage(data.error || 'Could not rollback.')
    setJob(data.job)
    setMessage(data.userMessage || '')
  }

  return (
    <main className="sb-page" style={{ maxWidth: 980 }}>
      <section className="hero-panel" style={{ padding: 24 }}>
        <div className="sb-kicker">🤖 AI Website Operator</div>
        <h1 className="sb-title" style={{ marginBottom: 8 }}>Describe what you want to change</h1>
        <p className="sb-subtitle">No code needed. I will create a plan, show changes, ask approval, and then publish safely.</p>

        <textarea
          value={request}
          onChange={(e) => setRequest(e.target.value)}
          rows={5}
          style={{ width: '100%', marginTop: 14, borderRadius: 14, border: '1px solid var(--border-soft)', background: 'rgba(255,255,255,.02)', color: '#fff', padding: 12 }}
        />

        <div style={{ marginTop: 12, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button className="sb-button-primary" onClick={createPlan} disabled={loading}>Here is my plan</button>
          {plan && <button className="sb-button-ghost" onClick={approveAndPublish} disabled={loading}>Approve update</button>}
          {job?.rollbackAvailable && <button className="sb-button-ghost" onClick={rollback} disabled={loading}>Restore previous version</button>}
        </div>
        {message && <p style={{ marginTop: 12, color: 'var(--text-secondary)' }}>{message}</p>}
      </section>

      {plan && (
        <section className="hero-panel" style={{ marginTop: 16, padding: 22 }}>
          <h2 style={{ color: '#fff' }}>Review changes</h2>
          <p style={{ color: 'var(--text-secondary)' }}>{plan.summary}</p>
          {plan.clarificationQuestion && (
            <div style={{ border: '1px solid var(--border-gold)', borderRadius: 12, padding: 10, margin: '10px 0', color: '#ffe38a' }}>
              Quick question: {plan.clarificationQuestion}
            </div>
          )}
          <ul>
            {plan.steps.map((s) => <li key={s} style={{ color: 'var(--text-secondary)', marginBottom: 6 }}>{s}</li>)}
          </ul>
          <h3 style={{ color: '#fff', marginTop: 12 }}>What will change</h3>
          <ul>
            {plan.preview.map((s) => <li key={s} style={{ color: 'var(--text-secondary)', marginBottom: 6 }}>{s}</li>)}
          </ul>
        </section>
      )}

      {job && (
        <section className="hero-panel" style={{ marginTop: 16, padding: 20 }}>
          <h3 style={{ color: '#fff' }}>Publish status</h3>
          <p style={{ color: 'var(--text-secondary)' }}>State: <strong>{job.state}</strong></p>
          <p style={{ color: 'var(--text-secondary)' }}>{job.publishMessage}</p>
        </section>
      )}
    </main>
  )
}
