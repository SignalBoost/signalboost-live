'use client'

import type { CSSProperties } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'
import { getOperationsDashboardCopy } from '@/lib/i18n/operationsDashboardCopy'
import type { OperationsIntelligenceSnapshot } from '@/lib/enterprise/operations/operationsIntelligence'

type Props = Readonly<{ snapshot: OperationsIntelligenceSnapshot }>

const panel: CSSProperties = {
  border: '1px solid rgba(255,255,255,.1)', borderRadius: 18,
  background: 'rgba(8,15,32,.72)', boxShadow: '0 18px 50px rgba(0,0,0,.24)',
  padding: 20, backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)',
}
const metric: CSSProperties = { ...panel, minHeight: 138, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }
const pct = (value: number) => `${Math.round(value * 100)}%`

function MetricCard({ label, value, detail }: Readonly<{ label: string; value: string | number; detail: string }>) {
  return <section style={metric} aria-label={label}>
    <div style={{ color: 'rgba(255,255,255,.62)', fontSize: 13, letterSpacing: '.08em', textTransform: 'uppercase' }}>{label}</div>
    <strong style={{ color: '#fff', fontSize: 34, lineHeight: 1.1 }}>{value}</strong>
    <div style={{ color: 'rgba(255,255,255,.68)', fontSize: 13 }}>{detail}</div>
  </section>
}

function Row({ label, value }: Readonly<{ label: string; value: string | number }>) {
  return <div style={{ display: 'flex', justifyContent: 'space-between', gap: 18, borderBottom: '1px solid rgba(255,255,255,.07)', paddingBottom: 10 }}>
    <dt style={{ color: 'rgba(255,255,255,.62)' }}>{label}</dt><dd style={{ margin: 0, fontWeight: 750 }}>{value}</dd>
  </div>
}

export default function ExecutiveOperationsDashboard({ snapshot }: Props) {
  const { lang } = useI18n()
  const c = getOperationsDashboardCopy(lang)
  const healthLabel = snapshot.health.state === 'green' ? c.stateGreen : snapshot.health.state === 'yellow' ? c.stateYellow : c.stateRed
  const healthColor = snapshot.health.state === 'green' ? '#5ee6a8' : snapshot.health.state === 'yellow' ? '#ffc300' : '#ff6b7a'

  return <main style={{ minHeight: '100vh', background: '#030611', color: '#fff', padding: '32px clamp(18px, 4vw, 56px)' }}>
    <div style={{ maxWidth: 1440, margin: '0 auto', display: 'grid', gap: 22 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 20, flexWrap: 'wrap' }}>
        <div><div style={{ color: '#ffc300', fontSize: 13, letterSpacing: '.14em', textTransform: 'uppercase', marginBottom: 8 }}>{c.eyebrow}</div>
          <h1 style={{ margin: 0, fontSize: 'clamp(30px, 5vw, 54px)', letterSpacing: '-.04em' }}>{c.title}</h1>
          <p style={{ color: 'rgba(255,255,255,.66)', margin: '10px 0 0', maxWidth: 760 }}>{c.description}</p>
        </div>
        <div style={{ color: 'rgba(255,255,255,.58)', fontSize: 13 }}>{c.generated} {new Date(snapshot.generatedAt).toLocaleString(lang)}</div>
      </header>

      <section style={panel} aria-labelledby="executive-summary-title"><div style={{ display: 'flex', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <div><div id="executive-summary-title" style={{ color: 'rgba(255,255,255,.62)', fontSize: 13, letterSpacing: '.08em', textTransform: 'uppercase' }}>{c.executiveSummary}</div>
          <div style={{ fontSize: 25, fontWeight: 750, marginTop: 10 }}>{c.organization} {snapshot.organizationId}</div>
          <div style={{ color: 'rgba(255,255,255,.68)', marginTop: 8 }}>{snapshot.incidents.open} {c.openSummary} · {snapshot.incidents.critical} {c.criticalSummary} · {snapshot.incidents.awaitingVerification} {c.awaitingVerification} · {snapshot.incidents.awaitingClosureApproval} {c.awaitingClosureApproval}</div>
        </div>
        <div style={{ minWidth: 170, textAlign: 'right' }}><div style={{ color: 'rgba(255,255,255,.62)', fontSize: 13, textTransform: 'uppercase' }}>{c.operationalHealth}</div>
          <div style={{ fontSize: 42, fontWeight: 800, marginTop: 6 }}>{snapshot.health.score}</div><div style={{ color: healthColor, textTransform: 'uppercase', fontWeight: 750 }}>{healthLabel}</div>
        </div>
      </div></section>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }} aria-label={c.title}>
        <MetricCard label={c.criticalIncidents} value={snapshot.incidents.critical} detail={`${snapshot.incidents.open} ${c.totalOpenIncidents}`} />
        <MetricCard label={c.openIncidents} value={snapshot.incidents.open} detail={`${snapshot.incidents.resolved} ${c.resolvedIncidents}`} />
        <MetricCard label={c.verificationSuccess} value={pct(snapshot.verification.successRate)} detail={`${snapshot.verification.verified} ${c.verified} · ${snapshot.verification.failed} ${c.failed}`} />
        <MetricCard label={c.learningConfidence} value={pct(snapshot.learning.averageRecommendationConfidence)} detail={`${snapshot.learning.acceptedSamples} ${c.verifiedLearningSamples}`} />
        <MetricCard label={c.trustedPlaybooks} value={snapshot.playbooks.trusted} detail={`${snapshot.playbooks.total} ${c.totalPlaybooks}`} />
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
        <section style={panel} aria-labelledby="verification-title"><h2 id="verification-title" style={{ margin: 0, fontSize: 18 }}>{c.verification}</h2><dl style={{ margin: '18px 0 0', display: 'grid', gap: 12 }}>
          <Row label={c.completed} value={snapshot.verification.completed} /><Row label={c.verified} value={snapshot.verification.verified} /><Row label={c.failed} value={snapshot.verification.failed} /><Row label={c.inconclusive} value={snapshot.verification.inconclusive} /><Row label={c.averageConfidence} value={pct(snapshot.verification.averageConfidence)} />
        </dl></section>
        <section style={panel} aria-labelledby="learning-title"><h2 id="learning-title" style={{ margin: 0, fontSize: 18 }}>{c.learning}</h2><dl style={{ margin: '18px 0 0', display: 'grid', gap: 12 }}>
          <Row label={c.acceptedSamples} value={snapshot.learning.acceptedSamples} /><Row label={c.ignoredOutcomes} value={snapshot.learning.ignoredOutcomes} /><Row label={c.strategies} value={snapshot.learning.strategies} /><Row label={c.recommendationConfidence} value={pct(snapshot.learning.averageRecommendationConfidence)} />
        </dl></section>
        <section style={panel} aria-labelledby="playbooks-title"><h2 id="playbooks-title" style={{ margin: 0, fontSize: 18 }}>{c.playbookStatus}</h2><dl style={{ margin: '18px 0 0', display: 'grid', gap: 12 }}>
          <Row label={c.trusted} value={snapshot.playbooks.trusted} /><Row label={c.recommended} value={snapshot.playbooks.recommended} /><Row label={c.candidate} value={snapshot.playbooks.candidate} /><Row label={c.deprecated} value={snapshot.playbooks.deprecated} />
        </dl></section>
      </section>

      <section style={panel} aria-labelledby="recent-incidents-title"><h2 id="recent-incidents-title" style={{ margin: 0, fontSize: 18 }}>{c.recentIncidentReferences}</h2>
        {snapshot.recentIncidentIds.length ? <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 16 }}>{snapshot.recentIncidentIds.map(id => <span key={id} style={{ border: '1px solid rgba(26,240,255,.25)', background: 'rgba(26,240,255,.08)', color: '#bafaff', borderRadius: 999, padding: '8px 12px', fontFamily: 'monospace', fontSize: 13 }}>{id}</span>)}</div> : <p style={{ color: 'rgba(255,255,255,.62)', marginBottom: 0 }}>{c.noIncidentReferences}</p>}
      </section>
    </div>
  </main>
}
