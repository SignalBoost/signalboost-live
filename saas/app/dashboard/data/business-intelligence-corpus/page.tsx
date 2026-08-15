'use client'

import { useCallback, useEffect, useState } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'
import { BUSINESS_INTELLIGENCE_CORPUS_COPY } from '@/lib/i18n/businessIntelligenceCorpusCopy'

type CorpusMetrics = {
  lookups?: number
  internalResolutions?: number
  providerCalls?: number
  internalResolutionRate?: number
  providerAvoidanceRate?: number
  averageConfidence?: number
  averageLatencyMs?: number
}

type CorpusStatus = {
  ok?: boolean
  target?: number
  count?: number
  remaining?: number
  completion?: number
  ready?: boolean
  internalFirst?: boolean
  providerFallbackPolicy?: string
  metrics?: CorpusMetrics | null
  error?: string
}

type SeedResult = {
  ok?: boolean
  scanned?: number
  candidates?: number
  uniqueCompanies?: number
  inserted?: number
  updated?: number
  failed?: number
  error?: string
}

function pct(value?: number) {
  return `${Number(((value ?? 0) * 100).toFixed(2))}%`
}

export default function BusinessIntelligenceCorpusPage() {
  const { lang } = useI18n()
  const copy = BUSINESS_INTELLIGENCE_CORPUS_COPY[lang] || BUSINESS_INTELLIGENCE_CORPUS_COPY.en
  const [status, setStatus] = useState<CorpusStatus | null>(null)
  const [result, setResult] = useState<SeedResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/admin/business-intelligence-corpus/status', { cache: 'no-store' })
      setStatus(await response.json())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  async function seedHistory() {
    if (running) return
    setRunning(true)
    setResult(null)
    try {
      const response = await fetch('/api/admin/business-intelligence-corpus/seed-outreach-history', { method: 'POST' })
      const body = await response.json().catch(() => ({ error: `HTTP ${response.status}` }))
      setResult(body)
      await refresh()
    } catch (error) {
      setResult({ ok: false, error: error instanceof Error ? error.message : copy.importFailed })
    } finally {
      setRunning(false)
    }
  }

  const count = status?.count ?? 0
  const target = status?.target ?? 5000
  const completion = status?.completion ?? 0
  const completionPercent = Number((completion * 100).toFixed(2))
  const metrics = status?.metrics

  return (
    <main style={{ maxWidth: 900, margin: '0 auto', padding: '40px 24px', color: '#fff' }}>
      <p style={{ color: '#ffc300', fontWeight: 800, letterSpacing: 1 }}>{copy.eyebrow}</p>
      <h1 style={{ fontSize: 34, margin: '8px 0' }}>{copy.title}</h1>
      <p style={{ opacity: .72, lineHeight: 1.6 }}>{copy.description}</p>

      <section style={{ marginTop: 28, padding: 24, border: '1px solid rgba(255,255,255,.14)', borderRadius: 16, background: 'rgba(255,255,255,.03)' }}>
        <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
          <div><strong style={{ fontSize: 28 }}>{loading ? '…' : count}</strong><div style={{ opacity: .6 }}>{copy.companies}</div></div>
          <div><strong style={{ fontSize: 28 }}>{target}</strong><div style={{ opacity: .6 }}>{copy.target}</div></div>
          <div><strong style={{ fontSize: 28 }}>{completionPercent}%</strong><div style={{ opacity: .6 }}>{copy.complete}</div></div>
        </div>

        <button
          type="button"
          onClick={seedHistory}
          disabled={running}
          style={{ marginTop: 28, padding: '13px 20px', borderRadius: 10, border: 0, cursor: running ? 'wait' : 'pointer', fontWeight: 800 }}
        >
          {running ? copy.importing : copy.importHistory}
        </button>
        <p style={{ marginTop: 10, opacity: .6, fontSize: 13 }}>{copy.ownerOnly}</p>

        {result && (
          <pre style={{ marginTop: 20, padding: 16, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', background: 'rgba(0,0,0,.35)', borderRadius: 10 }}>
            {JSON.stringify(result, null, 2)}
          </pre>
        )}
        {status?.error && <p style={{ color: '#ff7777' }}>{status.error}</p>}
      </section>

      <section style={{ marginTop: 20, padding: 24, border: '1px solid rgba(255,255,255,.14)', borderRadius: 16, background: 'rgba(255,255,255,.03)' }}>
        <h2 style={{ margin: 0, fontSize: 22 }}>{copy.operationalTitle}</h2>
        <p style={{ opacity: .68, lineHeight: 1.6 }}>{copy.internalFirstPolicy}</p>
        {metrics ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 14, marginTop: 18 }}>
            <div><strong style={{ fontSize: 22 }}>{metrics.lookups ?? 0}</strong><div style={{ opacity: .6 }}>{copy.lookups}</div></div>
            <div><strong style={{ fontSize: 22 }}>{metrics.internalResolutions ?? 0}</strong><div style={{ opacity: .6 }}>{copy.internalResolutions}</div></div>
            <div><strong style={{ fontSize: 22 }}>{metrics.providerCalls ?? 0}</strong><div style={{ opacity: .6 }}>{copy.providerCalls}</div></div>
            <div><strong style={{ fontSize: 22 }}>{pct(metrics.providerAvoidanceRate)}</strong><div style={{ opacity: .6 }}>{copy.providerAvoidance}</div></div>
            <div><strong style={{ fontSize: 22 }}>{pct(metrics.averageConfidence)}</strong><div style={{ opacity: .6 }}>{copy.averageConfidence}</div></div>
            <div><strong style={{ fontSize: 22 }}>{Math.round(metrics.averageLatencyMs ?? 0)} {copy.latencyUnit}</strong><div style={{ opacity: .6 }}>{copy.averageLatency}</div></div>
          </div>
        ) : <p style={{ opacity: .55 }}>{copy.metricsUnavailable}</p>}
      </section>
    </main>
  )
}
