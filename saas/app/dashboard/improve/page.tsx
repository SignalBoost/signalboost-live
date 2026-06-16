export default function OperatorApproval({ loading, onApprove }: { loading?: boolean; onApprove: () => void }) {
  return <button className="sb-button-ghost" onClick={onApprove} disabled={loading}>Approve update</button>
}
----------------------------
'use client'

type OperatorInputProps = {
  value: string
  loading?: boolean
  onChange: (value: string) => void
  onPlan: () => void
}

export default function OperatorInput({ value, loading, onChange, onPlan }: OperatorInputProps) {
  return (
    <section className="hero-panel" style={{ padding: 24 }}>
      <div className="sb-kicker">🤖 AI Website Operator</div>
      <h1 className="sb-title" style={{ marginBottom: 8 }}>Describe what you want to change</h1>
      <p className="sb-subtitle">No code needed. I will create a plan, show changes, ask approval, and then publish safely.</p>

      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={5}
        style={{ width: '100%', marginTop: 14, borderRadius: 14, border: '1px solid var(--border-soft)', background: 'rgba(255,255,255,.02)', color: '#fff', padding: 12 }}
      />

      <div style={{ marginTop: 12 }}>
        <button className="sb-button-primary" onClick={onPlan} disabled={loading}>Here is my plan</button>
      </div>
    </section>
  )
}
---------------------------
export type OperatorPlanView = {
  id: string
  summary: string
  clarificationQuestion?: string
  steps: string[]
  preview: string[]
}

export default function OperatorPlan({ plan }: { plan: OperatorPlanView }) {
  return (
    <section className="hero-panel" style={{ marginTop: 16, padding: 22 }}>
      <h2 style={{ color: '#fff' }}>Review changes</h2>
      <p style={{ color: 'var(--text-secondary)' }}>{plan.summary}</p>
      {plan.clarificationQuestion && (
        <div style={{ border: '1px solid var(--border-gold)', borderRadius: 12, padding: 10, margin: '10px 0', color: '#ffe38a' }}>
          Quick question: {plan.clarificationQuestion}
        </div>
      )}
      <ul>{plan.steps.map((s) => <li key={s} style={{ color: 'var(--text-secondary)', marginBottom: 6 }}>{s}</li>)}</ul>
      <h3 style={{ color: '#fff', marginTop: 12 }}>What will change</h3>
      <ul>{plan.preview.map((s) => <li key={s} style={{ color: 'var(--text-secondary)', marginBottom: 6 }}>{s}</li>)}</ul>
    </section>
  )
}
-------------------------------
export default function OperatorRollback({ loading, onRollback }: { loading?: boolean; onRollback: () => void }) {
  return <button className="sb-button-ghost" onClick={onRollback} disabled={loading}>Restore previous version</button>
}
--------------------------
export type OperatorJobView = {
  state: string
  publishMessage: string
}

export default function OperatorStatus({ job }: { job: OperatorJobView }) {
  return (
    <section className="hero-panel" style={{ marginTop: 16, padding: 20 }}>
      <h3 style={{ color: '#fff' }}>Publish status</h3>
      <p style={{ color: 'var(--text-secondary)' }}>State: <strong>{job.state}</strong></p>
      <p style={{ color: 'var(--text-secondary)' }}>{job.publishMessage}</p>
    </section>
  )
}
