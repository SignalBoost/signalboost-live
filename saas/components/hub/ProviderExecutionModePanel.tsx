'use client'


import { LocalizedText } from '@/components/i18n/LocalizedText'

import { useEffect, useMemo, useState } from 'react'

import type { ProviderExecutionMode } from '@/lib/hub/provider-execution-modes'
import { uiText } from '@/lib/i18n/uiText'

type CapabilityResponse = {
  ok: boolean
  error?: string
  preferredMode?: ProviderExecutionMode
  availableModes?: ProviderExecutionMode[]
  reviewed?: {
    reviewer: string
    reviewedAt: string
  } | null
}

type PreviewResponse = {
  ok: boolean
  error?: string
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
  direct: "Direct API",
  cosa_pr: "Governed AI infrastructure PR",
  browser_agent: "Browser Agent assistance",
  manual: "Direct configuration",
}

export type ProviderExecutionModePanelProps = {
  templateId: string
  payload: Record<string, unknown>
  selectedMode: ProviderExecutionMode
  onModeChange: (mode: ProviderExecutionMode) => void
  onPreviewChange?: (preview: PreviewResponse['preview'] | null) => void
  previewEnabled?: boolean
}

export default function ProviderExecutionModePanel({
  templateId,
  payload,
  selectedMode,
  onModeChange,
  onPreviewChange,
  previewEnabled = true,
}: ProviderExecutionModePanelProps) {
  const [capabilityLoading, setCapabilityLoading] = useState(false)
  const [capabilityResponse, setCapabilityResponse] = useState<CapabilityResponse | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewResponse, setPreviewResponse] = useState<PreviewResponse | null>(null)

  const previewRequestBody = useMemo(
    () => JSON.stringify({ templateId, payload, mode: selectedMode }),
    [payload, selectedMode, templateId],
  )

  useEffect(() => {
    const controller = new AbortController()

    async function loadCapabilities() {
      setCapabilityLoading(true)
      setCapabilityResponse(null)
      try {
        const res = await fetch('/api/hub/action/capabilities', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ templateId }),
          signal: controller.signal,
        })
        const data = await res.json() as CapabilityResponse
        setCapabilityResponse(data)

        if (data.ok && data.availableModes?.length && !data.availableModes.includes(selectedMode)) {
          onModeChange(data.preferredMode && data.availableModes.includes(data.preferredMode)
            ? data.preferredMode
            : data.availableModes[0])
        }
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          setCapabilityResponse({ ok: false, error: 'provider_capabilities_unavailable' })
        }
      } finally {
        if (!controller.signal.aborted) setCapabilityLoading(false)
      }
    }

    void loadCapabilities()
    return () => controller.abort()
  }, [onModeChange, selectedMode, templateId])

  useEffect(() => {
    if (!previewEnabled || !capabilityResponse?.ok) {
      setPreviewResponse(null)
      onPreviewChange?.(null)
      return
    }

    const availableModes = capabilityResponse.availableModes ?? []
    if (!availableModes.includes(selectedMode)) return

    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      setPreviewLoading(true)
      try {
        const res = await fetch('/api/hub/action/preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: previewRequestBody,
          signal: controller.signal,
        })
        const data = await res.json() as PreviewResponse
        setPreviewResponse(data)
        onPreviewChange?.(data.ok ? data.preview ?? null : null)
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          setPreviewResponse({ ok: false, error: 'provider_preview_unavailable' })
          onPreviewChange?.(null)
        }
      } finally {
        if (!controller.signal.aborted) setPreviewLoading(false)
      }
    }, 180)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [capabilityResponse, onPreviewChange, previewEnabled, previewRequestBody, selectedMode])

  const availableModes = capabilityResponse?.availableModes ?? []

  return (
    <section aria-label={uiText('generatedUi.u_dfd407e598bdb1a9')} style={{ display: 'grid', gap: 10 }}>
      <div>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,.72)' }}><LocalizedText fallback={uiText('generatedUi.u_24dbd0e1e35a7a41')} /></div>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,.5)', marginTop: 3 }}><LocalizedText fallback={uiText('generatedUi.u_c4c61d6000a811ab')} /></div>
      </div>

      {capabilityLoading && (
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,.55)' }}>{uiText('generatedUi.u_3c796c1059311507')}</div>
      )}

      {!capabilityLoading && capabilityResponse?.ok && (
        <>
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

          {capabilityResponse.reviewed && (
            <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,.42)' }}>{uiText('generatedUi.u_031cc20288b8fb16')}{capabilityResponse.reviewed.reviewer} · {capabilityResponse.reviewed.reviewedAt}
            </div>
          )}
        </>
      )}

      {!capabilityLoading && capabilityResponse && !capabilityResponse.ok && (
        <div role="alert" style={{ fontSize: 12, color: '#fca5a5' }}>{capabilityResponse.error || uiText('generatedUi.u_84ecf5bd99e57872')}</div>
      )}

      {previewEnabled && previewLoading && (
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,.55)' }}>{uiText('generatedUi.u_7b62b3c39f807deb')}</div>
      )}

      {previewEnabled && !previewLoading && previewResponse?.ok && previewResponse.preview && (
        <div style={{ padding: 12, borderRadius: 10, border: '1px solid rgba(255,255,255,.10)', background: 'rgba(3,7,18,.45)', display: 'grid', gap: 6 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: '#fff' }}>{previewResponse.preview.modeLabel}</div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,.62)' }}>{previewResponse.preview.target}</div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,.62)' }}>{previewResponse.preview.expectedVerification}</div>
          <div style={{ fontSize: 11, color: previewResponse.preview.executesProviderMutation ? '#fbbf24' : '#22c55e' }}>
            {previewResponse.preview.executesProviderMutation ? uiText('generatedUi.u_1d1679b9155c46fe') : uiText('generatedUi.u_17181036a40a9b75')}
          </div>
        </div>
      )}

      {previewEnabled && !previewLoading && previewResponse && !previewResponse.ok && (
        <div role="alert" style={{ fontSize: 12, color: '#fca5a5' }}>{previewResponse.error || uiText('generatedUi.u_b99fa6c061504f00')}</div>
      )}
    </section>
  )
}
