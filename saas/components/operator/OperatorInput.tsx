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
