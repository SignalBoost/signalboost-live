'use client'

import type { OperationsIntelligenceSnapshot } from '@/lib/enterprise/operations/operationsIntelligence'

type ExecutiveOperationsDashboardProps = Readonly<{
  snapshot: OperationsIntelligenceSnapshot
}>

const panelStyle: React.CSSProperties = {
  border: '1px solid rgba(255,255,255,.1)',
  borderRadius: 18,
  background: 'rgba(8,15,32,.72)',
  boxShadow: '0 18px 50px rgba(0,0,0,.24)',
  padding: 20,
  backdropFilter: 'blur(18px)',
  WebkitBackdropFilter: 'blur(18px)',
}

const metricStyle: React.CSSProperties = {
  ...panelStyle,
  minHeight: 138,
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'space-between',
}

function percentage(value: number): string {
  return `${Math.round(value * 100)}%`
}

function MetricCard({ label, value, detail }: Readonly<{ label: string; value: string | number; detail: string }>) {
  return (
    <section style={metricStyle} aria-label={label}>
      <div style={{ color: 'rgba(255,255,255,.62)', fontSize: 13, letterSpacing: '.08em', textTransform: 'uppercase' }}>{label}</div>
      <strong style={{ color: '#fff', fontSize: 34, lineHeight: 1.1 }}>{value}</strong>
      <div style={{ color: 'rgba(255,255,255,.68)', fontSize: 13 }}>{detail}</div>
    </section>
  )
}

export default function ExecutiveOperationsDashboard({ snapshot }: ExecutiveOperationsDashboardProps) {
  return (
    <main style={{ minHeight: '100vh', background: '#030611', color: '#fff', padding: '32px clamp(18px, 4vw, 56px)' }}>
      <div style={{ maxWidth: 1440, margin: '0 auto', display: 'grid', gap: 22 }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 20, flexWrap: 'wrap' }}>
          <div>
            <div style={{ color: '#ffc300', fontSize: 13, letterSpacing: '.14em', textTransform: 'uppercase', marginBottom: 8 }}>Mission 003 · Executive Dashboard</div>
            <h1 style={{ margin: 0, fontSize: 'clamp(30px, 5vw, 54px)', letterSpacing: '-.04em' }}>Operations Intelligence</h1>
            <p style={{ color: 'rgba(255,255,255,.66)', margin: '10px 0 0', maxWidth: 760 }}>
              Read-only executive visibility from the Operations Intelligence API. No repair, approval, execution, or learning controls are exposed here.
            </p>
          </div>
          <div style={{ color: 'rgba(255,255,255,.58)', fontSize: 13 }}>
            Generated {new Date(snapshot.generatedAt).toLocaleString()}
          </div>
        </header>

        <section style={panelStyle} aria-labelledby="executive-summary-title">
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap', alignItems: 'center' }}>
            <div>
              <div id="executive-summary-title" style={{ color: 'rgba(255,255,255,.62)', fontSize: 13, letterSpacing: '.08em', textTransform: 'uppercase' }}>Executive Summary</div>
              <div style={{ fontSize: 25, fontWeight: 750, marginTop: 10 }}>Organization {snapshot.organizationId}</div>
              <div style={{ color: 'rgba(255,255,255,.68)', marginTop: 8 }}>
                {snapshot.incidents.open} open incidents · {snapshot.incidents.critical} critical · {snapshot.incidents.awaitingVerification} awaiting verification · {snapshot.incidents.awaitingClosureApproval} awaiting closure approval
              </div>
            </div>
            <div style={{ minWidth: 170, textAlign: 'right' }}>
              <div style={{ color: 'rgba(255,255,255,.62)', fontSize: 13, textTransform: 'uppercase' }}>Operational Health</div>
              <div style={{ fontSize: 42, fontWeight: 800, marginTop: 6 }}>{snapshot.health.score}</div>
              <div style={{ color: snapshot.health.state === 'green' ? '#5ee6a8' : snapshot.health.state === 'yellow' ? '#ffc300' : '#ff6b7a', textTransform: 'uppercase', fontWeight: 750 }}>{snapshot.health.state}</div>
            </div>
          </div>
        </section>

        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }} aria-label="Executive operations metrics">
          <MetricCard label="Critical Incidents" value={snapshot.incidents.critical} detail={`${snapshot.incidents.open} total open incidents`} />
          <MetricCard label="Open Incidents" value={snapshot.incidents.open} detail={`${snapshot.incidents.resolved} resolved incidents`} />
          <MetricCard label="Verification Success" value={percentage(snapshot.verification.successRate)} detail={`${snapshot.verification.verified} verified · ${snapshot.verification.failed} failed`} />
          <MetricCard label="Learning Confidence" value={percentage(snapshot.learning.averageRecommendationConfidence)} detail={`${snapshot.learning.acceptedSamples} verified learning samples`} />
          <MetricCard label="Trusted Playbooks" value={snapshot.playbooks.trusted} detail={`${snapshot.playbooks.total} total playbooks`} />
        </section>

        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
          <section style={panelStyle} aria-labelledby="verification-title">
            <h2 id="verification-title" style={{ margin: 0, fontSize: 18 }}>Verification</h2>
            <dl style={{ margin: '18px 0 0', display: 'grid', gap: 12 }}>
              <Row label="Completed" value={snapshot.verification.completed} />
              <Row label="Verified" value={snapshot.verification.verified} />
              <Row label="Failed" value={snapshot.verification.failed} />
              <Row label="Inconclusive" value={snapshot.verification.inconclusive} />
              <Row label="Average confidence" value={percentage(snapshot.verification.averageConfidence)} />
            </dl>
          </section>

          <section style={panelStyle} aria-labelledby="learning-title">
            <h2 id="learning-title" style={{ margin: 0, fontSize: 18 }}>Learning</h2>
            <dl style={{ margin: '18px 0 0', display: 'grid', gap: 12 }}>
              <Row label="Accepted samples" value={snapshot.learning.acceptedSamples} />
              <Row label="Ignored outcomes" value={snapshot.learning.ignoredOutcomes} />
              <Row label="Strategies" value={snapshot.learning.strategies} />
              <Row label="Recommendation confidence" value={percentage(snapshot.learning.averageRecommendationConfidence)} />
            </dl>
          </section>

          <section style={panelStyle} aria-labelledby="playbooks-title">
            <h2 id="playbooks-title" style={{ margin: 0, fontSize: 18 }}>Playbook Status</h2>
            <dl style={{ margin: '18px 0 0', display: 'grid', gap: 12 }}>
              <Row label="Trusted" value={snapshot.playbooks.trusted} />
              <Row label="Recommended" value={snapshot.playbooks.recommended} />
              <Row label="Candidate" value={snapshot.playbooks.candidate} />
              <Row label="Deprecated" value={snapshot.playbooks.deprecated} />
            </dl>
          </section>
        </section>

        <section style={panelStyle} aria-labelledby="recent-incidents-title">
          <h2 id="recent-incidents-title" style={{ margin: 0, fontSize: 18 }}>Recent Incident References</h2>
          {snapshot.recentIncidentIds.length ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 16 }}>
              {snapshot.recentIncidentIds.map(incidentId => (
                <span key={incidentId} style={{ border: '1px solid rgba(26,240,255,.25)', background: 'rgba(26,240,255,.08)', color: '#bafaff', borderRadius: 999, padding: '8px 12px', fontFamily: 'monospace', fontSize: 13 }}>
                  {incidentId}
                </span>
              ))}
            </div>
          ) : (
            <p style={{ color: 'rgba(255,255,255,.62)', marginBottom: 0 }}>No incident references were returned by the Operations Intelligence API.</p>
          )}
        </section>
      </div>
    </main>
  )
}

function Row({ label, value }: Readonly<{ label: string; value: string | number }>) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 18, borderBottom: '1px solid rgba(255,255,255,.07)', paddingBottom: 10 }}>
      <dt style={{ color: 'rgba(255,255,255,.62)' }}>{label}</dt>
      <dd style={{ margin: 0, fontWeight: 750 }}>{value}</dd>
    </div>
  )
}
