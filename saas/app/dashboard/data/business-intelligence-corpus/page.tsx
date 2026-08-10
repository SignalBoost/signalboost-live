'use client'

import { useCallback, useEffect, useState } from 'react'

type CorpusStatus = {
  ok?: boolean
  target?: number
  count?: number
  remaining?: number
  completion?: number
  ready?: boolean
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

export default function BusinessIntelligenceCorpusPage() {
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
      setResult({ ok: false, error: error instanceof Error ? error.message : 'Import failed' })
    } finally {
      setRunning(false)
    }
  }

  const count = status?.count ?? 0
  const target = status?.target ?? 5000
  const completion = status?.completion ?? 0

  return (
    <main style={{ maxWidth: 900, margin: '0 auto', padding: '40px 24px', color: '#fff' }}>
      <p style={{ color: '#ffc300', fontWeight: 800, letterSpacing: 1 }}>BUSINESS INTELLIGENCE CORPUS</p>
      <h1 style={{ fontSize: 34, margin: '8px 0' }}>Internal company intelligence</h1>
      <p style={{ opacity: .72, lineHeight: 1.6 }}>
        Reuse company intelligence SignalBoost already discovered before spending money on external AI or data providers.
      </p>

      <section style={{ marginTop: 28, padding: 24, border: '1px solid rgba(255,255,255,.14)', borderRadius: 16, background: 'rgba(255,255,255,.03)' }}>
        <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
          <div><strong style={{ fontSize: 28 }}>{loading ? '…' : count}</strong><div style={{ opacity: .6 }}>Companies</div></div>
          <div><strong style={{ fontSize: 28 }}>{target}</strong><div style={{ opacity: .6 }}>Target</div></div>
          <div><strong style={{ fontSize: 28 }}>{completion}%</strong><div style={{ opacity: .6 }}>Complete</div></div>
        </div>

        <button
          type="button"
          onClick={seedHistory}
          disabled={running}
          style={{ marginTop: 28, padding: '13px 20px', borderRadius: 10, border: 0, cursor: running ? 'wait' : 'pointer', fontWeight: 800 }}
        >
          {running ? 'Importing existing outreach history…' : 'Import existing outreach history'}
        </button>
        <p style={{ marginTop: 10, opacity: .6, fontSize: 13 }}>
          Owner-only. Uses existing outreach history and does not call paid AI or prospect-data providers.
        </p>

        {result && (
          <pre style={{ marginTop: 20, padding: 16, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', background: 'rgba(0,0,0,.35)', borderRadius: 10 }}>
            {JSON.stringify(result, null, 2)}
          </pre>
        )}
        {status?.error && <p style={{ color: '#ff7777' }}>{status.error}</p>}
      </section>
    </main>
  )
}
