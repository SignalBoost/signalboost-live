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
