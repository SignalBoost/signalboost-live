'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useI18n } from '@/components/i18n/I18nProvider'
import { t } from '@/lib/i18n/t'

const EXAMPLES = [
  'Launch a campaign for my bakery',
  'Audit my website SEO and speed',
  'Turn my podcast episode into clips',
]

type OrchestrationResponse = {
  intent?: { module: string; href: string; confidence: number; reason: string }
  mode?: { mode: string; fallbackMode?: string; reason: string }
  fallback?: { required: boolean; summary: string; recommendedNextSteps: string[] }
  steps?: Array<{ id: string; label: string; status: string; attempts: number }>
}

export default function OrchestrationGuide({ compact = false }: { compact?: boolean }) {
  const { dict, lang } = useI18n()
  const [input, setInput] = useState(EXAMPLES[0])
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<OrchestrationResponse | null>(null)
  const [error, setError] = useState('')

  const status = useMemo(() => {
    if (loading) return t(dict, 'orchestration.status.routing', 'Routing request...')
    if (result?.fallback?.required) return t(dict, 'orchestration.status.operator', 'Operator fallback prepared')
    if (result) return t(dict, 'orchestration.status.ready', 'Workflow ready')
    return t(dict, 'orchestration.status.idle', 'Describe a goal and SignalBoost will route it')
  }, [dict, loading, result])

  async function run() {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/orchestration', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ input, language: lang }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Orchestration failed')
      setResult(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Orchestration failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="fathom-glass" style={{ borderRadius: 18, padding: compact ? 16 : 22, margin: compact ? '12px 0' : '24px 0', border: '1px solid rgba(59,130,246,.24)' }}>
      <div className="terminal-text" style={{ color: '#ffc300', fontSize: 11, fontWeight: 900, letterSpacing: '.12em', textTransform: 'uppercase' }}>
        {t(dict, 'orchestration.kicker', 'AI orchestration')}
      </div>
      <h2 style={{ margin: '8px 0', fontSize: compact ? 22 : 30 }}>{t(dict, 'orchestration.title', 'One router for every SignalBoost workflow')}</h2>
      <p style={{ color: 'var(--text-secondary)', margin: '0 0 14px', lineHeight: 1.6 }}>
        {t(dict, 'orchestration.subtitle', 'Intent routing, AI mode selection, validation, memory, telemetry, and operator fallback are applied before work reaches a module.')}
      </p>
      <div style={{ display: 'grid', gap: 10 }}>
        <textarea value={input} onChange={(e) => setInput(e.target.value)} rows={compact ? 2 : 3} style={{ width: '100%', borderRadius: 14, border: '1px solid rgba(255,255,255,.14)', background: 'rgba(0,0,0,.22)', color: '#fff', padding: 12 }} aria-label={t(dict, 'orchestration.promptLabel', 'Workflow goal')} />
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {EXAMPLES.map(example => <button key={example} type="button" onClick={() => setInput(example)} style={{ border: '1px solid rgba(255,255,255,.12)', borderRadius: 999, background: 'rgba(255,255,255,.05)', color: '#fff', padding: '7px 10px', cursor: 'pointer' }}>{example}</button>)}
        </div>
        <button type="button" onClick={run} disabled={loading || !input.trim()} className="sb-button-primary" style={{ justifySelf: 'start' }}>
          {loading ? t(dict, 'orchestration.runLoading', 'Routing...') : t(dict, 'orchestration.run', 'Run orchestration')}
        </button>
      </div>
      <div style={{ marginTop: 14, color: 'var(--text-secondary)' }}>{status}</div>
      {error && <p style={{ color: '#f87171' }}>{error}</p>}
      {result?.intent && (
        <div style={{ marginTop: 14, display: 'grid', gap: 10 }}>
          <div style={{ border: '1px solid rgba(255,255,255,.1)', borderRadius: 14, padding: 12, background: 'rgba(0,0,0,.18)' }}>
            <strong>{t(dict, 'orchestration.selected', 'Selected module')}:</strong> {result.intent.module.replace(/_/g, ' ')} · <strong>{t(dict, 'orchestration.mode', 'Mode')}:</strong> {result.mode?.mode.replace(/_/g, ' ')}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {result.steps?.map(step => <span key={step.id} style={{ border: '1px solid rgba(59,130,246,.28)', borderRadius: 999, padding: '6px 9px', color: '#bfdbfe' }}>{step.label}: {step.status}</span>)}
          </div>
          <Link href={result.intent.href} className="sb-button-secondary" style={{ textDecoration: 'none', justifySelf: 'start' }}>
            {t(dict, 'orchestration.openModule', 'Open recommended module')} →
          </Link>
        </div>
      )}
    </section>
  )
}
