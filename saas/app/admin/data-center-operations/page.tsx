'use client'

import { useState } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'
import { dataCenterUiText, type DataCenterUiLang } from '@/lib/data-center/uiCopy'

type Scenario = 'cooling-loop-degradation' | 'pdu-overload' | 'unrelated-concurrent-alerts'
type Diagnostic = {
  schema?: string
  clusterId: string
  summary?: string
  observedFacts?: string[]
  hypotheses?: Array<{ label: string; confidence: string; rationale: string; supportingObservationIds: string[] }>
  operatorChecks?: Array<{ priority: number; action: string; reason: string }>
  missingEvidence?: string[]
  controlAuthority?: string
  rootCauseStatus?: string
  error?: string
}
type Result = {
  ok: boolean
  mode?: string
  scenario?: Scenario
  advisoryOnly?: boolean
  facilityControlAllowed?: boolean
  observations?: Array<{
    observationId: string
    observedAt: string
    siteId: string
    assetClass: string
    assetId: string
    eventType: string
    severity: string
    message: string
    metric?: { name: string; value: number; unit: string } | null
  }>
  clusters?: Array<{
    clusterId: string
    siteId: string
    severity: string
    sharedCorrelationKeys: string[]
    observationIds: string[]
  }>
  diagnostics?: Diagnostic[]
  error?: string
}

export default function DataCenterOperationsPage() {
  const { lang } = useI18n()
  const language = (['en', 'es', 'pt', 'pl', 'ru'].includes(lang) ? lang : 'en') as DataCenterUiLang
  const c = (key: Parameters<typeof dataCenterUiText>[0]) => dataCenterUiText(key, language)
  const [scenario, setScenario] = useState<Scenario>('cooling-loop-degradation')
  const [result, setResult] = useState<Result | null>(null)
  const [loading, setLoading] = useState(false)

  async function run() {
    if (loading) return
    setLoading(true)
    setResult(null)
    try {
      const response = await fetch('/api/admin/data-center-operations/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenario, diagnose: true }),
      })
      const payload = await response.json().catch(() => null) as Result | null
      setResult(payload || { ok: false, error: 'invalid_response' })
    } catch (error) {
      setResult({ ok: false, error: error instanceof Error ? error.message : 'request_failed' })
    } finally {
      setLoading(false)
    }
  }

  const scenarios: Array<{ id: Scenario; label: string }> = [
    { id: 'cooling-loop-degradation', label: c('cooling') },
    { id: 'pdu-overload', label: c('pdu') },
    { id: 'unrelated-concurrent-alerts', label: c('unrelated') },
  ]

  return <main style={{ maxWidth: 1180, margin: '0 auto', padding: '30px 22px 70px' }}>
    <header style={{ marginBottom: 22 }}>
      <h1 style={{ margin: 0, fontSize: 32 }}>{c('title')}</h1>
      <p style={{ opacity: .78, marginTop: 8 }}>{c('subtitle')}</p>
      <div style={{ marginTop: 12, padding: '10px 12px', border: '1px solid rgba(245,196,81,.35)', borderRadius: 10, background: 'rgba(245,196,81,.08)' }}>{c('safety')}</div>
    </header>

    <section style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))' }}>
      {scenarios.map(item => <button key={item.id} type="button" onClick={() => setScenario(item.id)} style={{ textAlign: 'left', padding: 14, borderRadius: 12, border: scenario === item.id ? '1px solid #5ce1e6' : '1px solid rgba(255,255,255,.16)', background: scenario === item.id ? 'rgba(92,225,230,.1)' : 'rgba(255,255,255,.04)', color: 'inherit', cursor: 'pointer' }}>{item.label}</button>)}
    </section>

    <button type="button" onClick={() => void run()} disabled={loading} style={{ marginTop: 16, padding: '11px 18px', borderRadius: 10, border: 0, fontWeight: 800, cursor: loading ? 'wait' : 'pointer' }}>{loading ? c('running') : c('run')}</button>

    {result && !result.ok ? <section style={{ marginTop: 24, padding: 16, border: '1px solid rgba(248,113,113,.45)', borderRadius: 12 }}><strong>{c('failed')}</strong><div style={{ marginTop: 7, opacity: .8 }}>{result.error}</div></section> : null}

    {result?.ok ? <div style={{ display: 'grid', gap: 20, marginTop: 28 }}>
      <section>
        <h2>{c('observations')}</h2>
        <div style={{ display: 'grid', gap: 10 }}>
          {(result.observations || []).map(item => <article key={item.observationId} style={{ padding: 14, border: '1px solid rgba(255,255,255,.13)', borderRadius: 12, background: 'rgba(255,255,255,.035)' }}>
            <div style={{ fontWeight: 800 }}>{item.assetClass} / {item.assetId}</div>
            <div style={{ fontSize: 12, opacity: .68, marginTop: 4 }}>{item.siteId} · {item.eventType} · {item.severity}</div>
            <p style={{ marginBottom: 4 }}>{item.message}</p>
            {item.metric ? <code>{item.metric.name} = {item.metric.value} {item.metric.unit}</code> : null}
          </article>)}
        </div>
      </section>

      <section>
        <h2>{c('clusters')}</h2>
        <div style={{ display: 'grid', gap: 10 }}>
          {(result.clusters || []).map(cluster => <article key={cluster.clusterId} style={{ padding: 14, border: '1px solid rgba(92,225,230,.22)', borderRadius: 12 }}>
            <strong>{cluster.clusterId}</strong>
            <div style={{ marginTop: 6, fontSize: 13, opacity: .76 }}>{cluster.siteId} · {cluster.severity}</div>
            <div style={{ marginTop: 6 }}>{cluster.sharedCorrelationKeys.join(', ') || c('none')}</div>
          </article>)}
        </div>
      </section>

      <section>
        <h2>{c('diagnostics')}</h2>
        <div style={{ display: 'grid', gap: 16 }}>
          {(result.diagnostics || []).map(diagnostic => <article key={diagnostic.clusterId} style={{ padding: 18, border: '1px solid rgba(245,196,81,.25)', borderRadius: 14, background: 'rgba(8,14,28,.55)' }}>
            <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', fontSize: 12, opacity: .78 }}>
              <span>{c('rootCause')}: {diagnostic.rootCauseStatus || c('none')}</span>
              <span>{c('control')}: {diagnostic.controlAuthority === 'none' ? c('disabled') : diagnostic.controlAuthority}</span>
            </div>
            {diagnostic.error ? <p>{diagnostic.error}</p> : <>
              <p style={{ fontSize: 17, lineHeight: 1.55 }}>{diagnostic.summary}</p>
              <h3>{c('facts')}</h3>
              <ul>{(diagnostic.observedFacts || []).map((fact, index) => <li key={`${diagnostic.clusterId}-f-${index}`}>{fact}</li>)}</ul>
              <h3>{c('hypotheses')}</h3>
              <div style={{ display: 'grid', gap: 9 }}>{(diagnostic.hypotheses || []).map((hypothesis, index) => <div key={`${diagnostic.clusterId}-h-${index}`} style={{ padding: 10, background: 'rgba(255,255,255,.04)', borderRadius: 9 }}><strong>{hypothesis.label} · {hypothesis.confidence}</strong><div style={{ marginTop: 5 }}>{hypothesis.rationale}</div></div>)}</div>
              <h3>{c('checks')}</h3>
              <ol>{(diagnostic.operatorChecks || []).map((check, index) => <li key={`${diagnostic.clusterId}-c-${index}`}><strong>{check.action}</strong><div style={{ opacity: .75, marginTop: 3 }}>{check.reason}</div></li>)}</ol>
              <h3>{c('missing')}</h3>
              <ul>{(diagnostic.missingEvidence || []).length ? (diagnostic.missingEvidence || []).map((item, index) => <li key={`${diagnostic.clusterId}-m-${index}`}>{item}</li>) : <li>{c('none')}</li>}</ul>
            </>}
          </article>)}
        </div>
      </section>
    </div> : null}
  </main>
}
