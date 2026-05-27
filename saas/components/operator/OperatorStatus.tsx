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
