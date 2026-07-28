import { LocalizedText } from '@/components/i18n/LocalizedText'

// saas/components/hub/ProviderActionExecutionGate.tsx
'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'

import { discoverReviewedProviderCapabilities } from '@/lib/hub/provider-capability-client'
import type {
  ProviderCapabilityResponse,
  ReviewedProviderCapabilitySnapshot,
} from '@/lib/hub/provider-action-client'
import type { ProviderExecutionMode } from '@/lib/hub/provider-execution-modes'
import GovernedProviderActionFetchBoundary from './GovernedProviderActionFetchBoundary.tsx'
import { uiText } from '@/lib/i18n/uiText'

export type ReviewedProviderCapability = ReviewedProviderCapabilitySnapshot

export type ProviderExecutionHandoff = Readonly<{
  templateId: string
  selectedMode: ProviderExecutionMode
  selectedCapability: ReviewedProviderCapability
  availableCapabilities: readonly ReviewedProviderCapability[]
  review: ProviderCapabilityResponse['review']
}>

export type ProviderActionExecutionGateProps = Readonly<{
  templateId: string
  children: ReactNode
  renderReviewedMode?: (handoff: ProviderExecutionHandoff) => ReactNode
}>

const LABELS: Record<ProviderExecutionMode, string> = {
  direct: "Direct API",
  cosa_pr: "Governed AI infrastructure PR",
  browser_agent: "Browser Agent assistance",
  manual: "Direct configuration",
}

const DETAILS: Record<ProviderExecutionMode, string> = {
  direct: 'Uses the reviewed provider API route. Provider mutation occurs only after the existing preview and confirmation controls.',
  cosa_pr: 'Stages a governed infrastructure proposal for review. It does not directly mutate the provider.',
  browser_agent: 'Creates a reviewed dry-run package only. Production browser execution remains disabled.',
  manual: 'Provides a direct-configuration path without issuing an automated provider request.',
}

export default function ProviderActionExecutionGate({ templateId, children, renderReviewedMode }: ProviderActionExecutionGateProps) {
  const [response, setResponse] = useState<ProviderCapabilityResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedMode, setSelectedMode] = useState<ProviderExecutionMode | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    async function load() {
      setLoading(true)
      setSelectedMode(null)
      try {
        const discovered = await discoverReviewedProviderCapabilities(templateId, fetch, controller.signal)
        if (!controller.signal.aborted) setResponse(discovered)
      } catch (error) {
        if (!controller.signal.aborted && (error as Error).name !== 'AbortError') {
          setResponse(Object.freeze({
            ok: false,
            error: 'provider_capabilities_unavailable',
            availableModes: Object.freeze([]),
            reviewedCapabilities: Object.freeze([]),
            review: null,
          }))
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }
    void load()
    return () => controller.abort()
  }, [templateId])

  const available = useMemo(
    () => response?.reviewedCapabilities || Object.freeze([] as ReviewedProviderCapability[]),
    [response],
  )

  useEffect(() => {
    if (!response?.ok || available.length === 0 || selectedMode) return
    const preferred = response.preferredMode && available.some(capability => capability.mode === response.preferredMode)
      ? response.preferredMode
      : available[0].mode
    setSelectedMode(preferred)
  }, [available, response, selectedMode])

  if (loading) return <GateNotice title={uiText('generatedUi.u_2dc320e1e5d262d4')} />
  if (!response?.ok) return <GateNotice title={uiText('generatedUi.u_84ecf5bd99e57872')} detail={response?.error || 'provider_capabilities_unavailable'} danger />
  if (available.length === 0) return <GateNotice title={uiText('generatedUi.u_ebc40a184d664158')} detail={uiText('generatedUi.u_60282765a5700b80')} danger />

  const selected = available.find(capability => capability.mode === selectedMode) || available[0]
  const handoff: ProviderExecutionHandoff = Object.freeze({
    templateId: String(templateId || '').trim(),
    selectedMode: selected.mode,
    selectedCapability: selected,
    availableCapabilities: Object.freeze([...available]),
    review: response.review || null,
  })

  const reviewedContent = renderReviewedMode?.(handoff)

  return (
    <div style={{ width: '100%', height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <section aria-label={uiText('generatedUi.u_21cf1512cd9c4969')} style={{ padding: 10, borderRadius: 10, border: '1px solid rgba(255,255,255,.10)', background: 'rgba(3,7,18,.38)', display: 'grid', gap: 8, flex: '0 0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline' }}>
          <strong style={{ fontSize: 11, color: '#86efac' }}><LocalizedText fallback={uiText('generatedUi.u_e94c0695ba5d0162')} /></strong>
          {response.review && <span style={{ fontSize: 9.5, color: 'rgba(255,255,255,.42)' }}>{response.review.reviewer} · {response.review.reviewedAt}</span>}
        </div>
        <div role="radiogroup" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(145px, 1fr))', gap: 7 }}>
          {available.map(capability => {
            const active = capability.mode === selected.mode
            return (
              <button key={capability.mode} type="button" role="radio" aria-checked={active} onClick={() => setSelectedMode(capability.mode)} style={{ padding: '9px 10px', borderRadius: 9, border: active ? '1px solid rgba(26,240,255,.70)' : '1px solid rgba(255,255,255,.12)', background: active ? 'rgba(26,240,255,.11)' : 'rgba(255,255,255,.03)', color: '#fff', textAlign: 'left', cursor: 'pointer', fontSize: 11, fontWeight: 750 }}>
                {LABELS[capability.mode]}
              </button>
            )
          })}
        </div>
        <div style={{ fontSize: 10.5, lineHeight: 1.45, color: 'rgba(255,255,255,.58)' }}>{DETAILS[selected.mode]}</div>
      </section>

      {reviewedContent !== undefined ? (
        <div style={{ flex: '1 1 auto', minHeight: 0 }}>{reviewedContent}</div>
      ) : selected.mode === 'direct' ? (
        <div style={{ flex: '1 1 auto', minHeight: 0 }}>
          <GovernedProviderActionFetchBoundary handoff={handoff}>
            {children}
          </GovernedProviderActionFetchBoundary>
        </div>
      ) : (
        <GateNotice
          title={`${LABELS[selected.mode]} is reviewed but not enabled in this legacy form`}
          detail={selected.mode === 'browser_agent'
            ? 'The reviewed adapter and approved origin remain available to the governed client controller. This screen will not launch a browser.'
            : selected.mode === 'cosa_pr'
              ? 'Proposal staging remains available only through the governed client controller. This screen will not submit a provider mutation.'
              : 'No automated request will be sent. Use the provider configuration guidance for this action.'}
        />
      )}
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
