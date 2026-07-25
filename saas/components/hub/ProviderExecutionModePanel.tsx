'use client'

import { useEffect, useMemo, useState } from 'react'

import type { ProviderExecutionMode } from '@/lib/hub/provider-execution-modes'

type PreviewResponse = {
  ok: boolean
  error?: string
  availableModes?: ProviderExecutionMode[]
  preview?: {
    mode: ProviderExecutionMode
    modeLabel: string
    provider: string
    target: string
    approvalRequired: boolean
    expectedVerification: string
    executesProviderMutation: boolean
    payload: Record<string, unknown>
  }
}

const LABELS: Record<ProviderExecutionMode, string> = {
  direct: 'Direct API',
  cosa_pr: 'Governed AI infrastructure PR',
  browser_agent: 'Browser Agent assistance',
  manual: 'Direct configuration',
}

export type ProviderExecutionModePanelProps = {
  templateId: string
  payload: Record<string, unknown>
  selectedMode: ProviderExecutionMode
  onModeChange: (mode: ProviderExecutionMode) => void
  onPreviewChange?: (preview: PreviewResponse['preview'] | null) => void
}

export default function ProviderExecutionModePanel({
  templateId,
  payload,
  selectedMode,
  onModeChange,
  onPreviewChange,
}: ProviderExecutionModePanelProps) {
  const [loading, setLoading] = useState(false)
  const [response, setResponse] = useState<PreviewResponse | null>(null)

  const requestBody = useMemo(
    () => JSON.stringify({ templateId, payload, mode: selectedMode }),
    [payload, selectedMode, templateId],
  )

  useEffect(() => {
    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      setLoading(true)
      try {
        const res = await fetch('/api/hub/action/preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: requestBody,
          signal: controller.signal,
        })
        const data = await res.json() as PreviewResponse
        setResponse(data)
        onPreviewChange?.(data.ok ? data.preview ?? null : null)
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          setResponse({ ok: false, error: 'provider_preview_unavailable' })
          onPreviewChange?.(null)
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }, 180)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [onPreviewChange, requestBody])

  const availableModes = response?.availableModes ?? []

  return (
    <section aria-label="Provider execution mode" style={{ display: 'grid', gap: 10 }}>
      <div>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,.72)' }}>
          Execution path
        </div>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,.5)', marginTop: 3 }}>
          Only reviewed and implemented paths are shown.
        </div>
      </div>

      <div role="radiogroup" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8 }}>
        {availableModes.map(mode => {
          const active = mode === selectedMode
          return (
            <button
              key={mode}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onModeChange(mode)}
              style={{
                padding: '10px 11px',
                borderRadius: 10,
                border: active ? '1px solid rgba(26,240,255,.72)' : '1px solid rgba(255,255,255,.12)',
                background: active ? 'rgba(26,240,255,.12)' : 'rgba(255,255,255,.035)',
                color: '#fff',
                textAlign: 'left',
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              {LABELS[mode]}
            </button>
          )
        })}
      </div>

      {loading && <div style={{ fontSize: 12, color: 'rgba(255,255,255,.55)' }}>Preparing governed preview…</div>}

      {!loading && response?.ok && response.preview && (
        <div style={{ padding: 12, borderRadius: 10, border: '1px solid rgba(255,255,255,.10)', background: 'rgba(3,7,18,.45)', display: 'grid', gap: 6 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: '#fff' }}>{response.preview.modeLabel}</div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,.62)' }}>{response.preview.target}</div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,.62)' }}>{response.preview.expectedVerification}</div>
          <div style={{ fontSize: 11, color: response.preview.executesProviderMutation ? '#fbbf24' : '#22c55e' }}>
            {response.preview.executesProviderMutation ? 'Provider mutation occurs only after confirmation.' : 'This path does not directly mutate the provider.'}
          </div>
        </div>
      )}

      {!loading && response && !response.ok && (
        <div role="alert" style={{ fontSize: 12, color: '#fca5a5' }}>{response.error || 'Preview unavailable'}</div>
      )}
    </section>
  )
}
