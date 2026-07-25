'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'

import type { ProviderExecutionMode } from '@/lib/hub/provider-execution-modes'

type Capability = Readonly<{
  mode: ProviderExecutionMode
  available: boolean
  reason?: string
  endpoint?: string | null
  browserAdapterId?: string | null
  approvedOrigin?: string | null
}>

type CapabilityResponse = Readonly<{
  ok: boolean
  error?: string
  preferredMode?: ProviderExecutionMode
  capabilities?: readonly Capability[]
  review?: Readonly<{ reviewer: string; reviewedAt: string }> | null
}>

export type ProviderActionExecutionGateProps = Readonly<{
  templateId: string
  children: ReactNode
}>

const LABELS: Record<ProviderExecutionMode, string> = {
  direct: 'Direct API',
  cosa_pr: 'Governed AI infrastructure PR',
  browser_agent: 'Browser Agent assistance',
  manual: 'Direct configuration',
}

export default function ProviderActionExecutionGate({ templateId, children }: ProviderActionExecutionGateProps) {
  const [response, setResponse] = useState<CapabilityResponse | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const controller = new AbortController()

    async function load() {
      setLoading(true)
      try {
        const res = await fetch('/api/hub/action/capabilities', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ templateId }),
          signal: controller.signal,
        })
        const data = await res.json() as CapabilityResponse
        if (!controller.signal.aborted) setResponse(data)
      } catch (error) {
        if (!controller.signal.aborted && (error as Error).name !== 'AbortError') {
          setResponse({ ok: false, error: 'provider_capabilities_unavailable' })
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }

    void load()
    return () => controller.abort()
  }, [templateId])

  const available = useMemo(
    () => (response?.capabilities || []).filter(capability => capability.available),
    [response],
  )
  const directReviewed = available.some(capability => capability.mode === 'direct')

  if (loading) {
    return <GateNotice title="Checking reviewed execution paths…" />
  }

  if (!response?.ok) {
    return <GateNotice title="Execution paths unavailable" detail={response?.error || 'provider_capabilities_unavailable'} danger />
  }

  if (!directReviewed) {
    return (
      <GateNotice
        title="Direct execution is not reviewed for this action"
        detail={available.length > 0
          ? `Reviewed paths: ${available.map(capability => LABELS[capability.mode]).join(', ')}. The legacy provider form remains blocked until it is wired to the governed submission controller.`
          : 'No reviewed execution path is available. This action is blocked by default.'}
        provenance={response.review ? `Reviewed by ${response.review.reviewer} · ${response.review.reviewedAt}` : undefined}
        danger
      />
    )
  }

  return (
    <div style={{ width: '100%', height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ padding: '8px 11px', borderRadius: 10, border: '1px solid rgba(34,197,94,.28)', background: 'rgba(34,197,94,.07)', fontSize: 11, color: 'rgba(255,255,255,.68)', flex: '0 0 auto' }}>
        <strong style={{ color: '#86efac' }}>Reviewed path:</strong> Direct API
        {response.review && <span> · {response.review.reviewer} · {response.review.reviewedAt}</span>}
      </div>
      <div style={{ flex: '1 1 auto', minHeight: 0 }}>{children}</div>
    </div>
  )
}

function GateNotice({ title, detail, provenance, danger = false }: { title: string; detail?: string; provenance?: string; danger?: boolean }) {
  return (
    <div role={danger ? 'alert' : 'status'} style={{ padding: 18, borderRadius: 12, border: danger ? '1px solid rgba(248,113,113,.32)' : '1px solid rgba(26,240,255,.22)', background: danger ? 'rgba(127,29,29,.16)' : 'rgba(26,240,255,.06)', display: 'grid', gap: 7 }}>
      <div style={{ fontSize: 13, fontWeight: 800, color: danger ? '#fca5a5' : '#fff' }}>{title}</div>
      {detail && <div style={{ fontSize: 12, lineHeight: 1.5, color: 'rgba(255,255,255,.62)' }}>{detail}</div>}
      {provenance && <div style={{ fontSize: 10, color: 'rgba(255,255,255,.42)' }}>{provenance}</div>}
    </div>
  )
}
