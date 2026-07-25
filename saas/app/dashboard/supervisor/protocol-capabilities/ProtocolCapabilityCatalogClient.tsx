'use client'

import { useEffect, useState } from 'react'

type Snapshot = {
  generatedAt: string
  summary: {
    protocols: number
    mutatingProtocols: number
    supervisoryOnlyProtocols: number
    safetyClassifiedProtocols: number
  }
  protocols: Array<{
    protocolId: string
    version: string
    domain: string
    operations: string[]
    mutating: boolean
    safetyHints: string[]
    evidence: string[]
    supervisoryOnly: boolean
  }>
  safety: {
    readOnly: true
    executionControlsExposed: false
    mutationControlsExposed: false
  }
  schemaVersion: string
}

export default function ProtocolCapabilityCatalogClient() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/internal/supervisor/protocol-capabilities', {
      method: 'GET',
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async response => {
        if (!response.ok) throw new Error('Protocol capability diagnostics unavailable')
        return response.json() as Promise<Snapshot>
      })
      .then(setSnapshot)
      .catch(reason => {
        if ((reason as Error).name !== 'AbortError') setError((reason as Error).message)
      })
    return () => controller.abort()
  }, [])

  return (
    <main style={page}>
      <header style={{ display: 'grid', gap: 8 }}>
        <div style={eyebrow}>Agent Gateway</div>
        <h1 style={{ margin: 0 }}>Protocol capability catalog</h1>
        <p style={muted}>Read-only operator visibility into registered protocol boundaries, evidence, and safety classifications.</p>
      </header>

      {error && <div role="alert" style={errorCard}>{error}</div>}
      {!snapshot && !error && <p style={muted}>Loading protocol capabilities…</p>}

      {snapshot && (
        <>
          <section aria-label="Protocol summary" style={summaryGrid}>
            <Metric label="Protocols" value={snapshot.summary.protocols} />
            <Metric label="Mutating" value={snapshot.summary.mutatingProtocols} />
            <Metric label="Supervisory only" value={snapshot.summary.supervisoryOnlyProtocols} />
            <Metric label="Safety classified" value={snapshot.summary.safetyClassifiedProtocols} />
          </section>

          <section style={{ display: 'grid', gap: 12 }}>
            {snapshot.protocols.map(protocol => (
              <article key={protocol.protocolId} style={card}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'baseline' }}>
                  <h2 style={{ margin: 0, fontSize: 18 }}>{protocol.protocolId.toUpperCase()}</h2>
                  <span style={pill}>{protocol.domain} · v{protocol.version}</span>
                </div>
                <Row label="Operations" values={protocol.operations} />
                <Row label="Safety hints" values={protocol.safetyHints} />
                <Row label="Evidence" values={protocol.evidence} />
                <div style={boundary}>
                  {protocol.mutating ? 'May describe mutating operations' : 'Non-mutating protocol'} · {protocol.supervisoryOnly ? 'Supervisory boundary only' : 'Software boundary'}
                </div>
              </article>
            ))}
          </section>

          <footer style={footer}>
            Read-only diagnostics. Execution controls exposed: no. Mutation controls exposed: no. Schema: {snapshot.schemaVersion}.
          </footer>
        </>
      )}
    </main>
  )
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div style={metric}><strong style={{ fontSize: 24 }}>{value}</strong><span style={muted}>{label}</span></div>
}

function Row({ label, values }: { label: string; values: string[] }) {
  return <div><div style={rowLabel}>{label}</div><div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{values.map(value => <span key={value} style={tag}>{value}</span>)}</div></div>
}

const page = { minHeight: '100vh', padding: 32, color: '#fff', background: 'linear-gradient(135deg,#06111f,#05070c)', display: 'grid', gap: 24 }
const eyebrow = { fontSize: 11, fontWeight: 800, letterSpacing: '.12em', textTransform: 'uppercase' as const, color: '#67e8f9' }
const muted = { color: 'rgba(255,255,255,.62)', margin: 0 }
const summaryGrid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12 }
const metric = { display: 'grid', gap: 4, padding: 16, borderRadius: 12, border: '1px solid rgba(255,255,255,.1)', background: 'rgba(255,255,255,.035)' }
const card = { display: 'grid', gap: 14, padding: 18, borderRadius: 14, border: '1px solid rgba(255,255,255,.1)', background: 'rgba(3,7,18,.56)' }
const pill = { fontSize: 11, padding: '4px 8px', borderRadius: 999, background: 'rgba(103,232,249,.12)', color: '#a5f3fc' }
const rowLabel = { fontSize: 11, fontWeight: 800, textTransform: 'uppercase' as const, letterSpacing: '.08em', color: 'rgba(255,255,255,.55)', marginBottom: 7 }
const tag = { fontSize: 11, padding: '4px 7px', borderRadius: 7, background: 'rgba(255,255,255,.07)', color: 'rgba(255,255,255,.8)' }
const boundary = { fontSize: 12, color: '#fde68a' }
const footer = { fontSize: 12, color: 'rgba(255,255,255,.55)', paddingTop: 4 }
const errorCard = { padding: 14, borderRadius: 10, border: '1px solid rgba(248,113,113,.4)', color: '#fecaca', background: 'rgba(127,29,29,.25)' }
