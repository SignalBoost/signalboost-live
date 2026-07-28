'use client'

import { useMemo, useState, type FormEvent } from 'react'
import {
  SearchableMultiSelect,
  SearchableSelect,
  SourceUrlField,
  SuggestionCardGrid,
  validateSourceUrl,
  type SuggestionCard,
} from '@/components/enterprise'
import { enterpriseOptions } from '@/lib/enterprise/masterConfig'
import {
  buildCampaignDirective,
  isCampaignBriefComplete,
  type StructuredCampaignBrief,
} from '@/lib/enterprise/campaignBrief'
import type { UrlIntelligenceResult } from '@/lib/enterprise/url-intelligence/types'
import { uiCopy } from '@/lib/i18n/generatedUiCopy'


export type PromoteCampaignRequest = {
  businessName: string
  promotion: string
  audience: string
  tone: string
  websiteUrl: string
}

type Props = {
  busy?: boolean
  language: string
  onSubmit: (request: PromoteCampaignRequest) => Promise<void> | void
  onReset?: () => void
}

const concepts: SuggestionCard[] = [
  {
    id: 'authority',
    title: uiCopy('u_12f657cd77286b81'),
    description: uiCopy('u_bdb55b1b013834a8'),
    metadata: ['Trust', 'Proof', 'Value'],
  },
  {
    id: 'offer',
    title: uiCopy('u_ee81f9877e809128'),
    description: uiCopy('u_c69ed094ff23a1ec'),
    metadata: ['Offer', 'Urgency', 'CTA'],
  },
  {
    id: 'education',
    title: uiCopy('u_0fe11301146f2ff4'),
    description: uiCopy('u_efaf1b6b5b51a874'),
    metadata: ['Education', 'Clarity', 'Conversion'],
  },
]

export function PromoteCampaignConfigurator({ busy, language, onSubmit, onReset }: Props) {
  const [sourceUrl, setSourceUrl] = useState('')
  const [goal, setGoal] = useState('')
  const [audiences, setAudiences] = useState<string[]>([])
  const [tone, setTone] = useState('')
  const [region, setRegion] = useState('')
  const [platforms, setPlatforms] = useState<string[]>([])
  const [format, setFormat] = useState('')
  const [offerType, setOfferType] = useState('')
  const [ctaStrategy, setCtaStrategy] = useState('')
  const [concept, setConcept] = useState('authority')
  const [error, setError] = useState('')
  const [analyzing, setAnalyzing] = useState(false)
  const [intelligence, setIntelligence] = useState<UrlIntelligenceResult | null>(null)

  const selectedConcept = useMemo(
    () => concepts.find((item) => item.id === concept),
    [concept],
  )

  const brief: StructuredCampaignBrief = {
    sourceUrl,
    goal,
    audiences,
    tone,
    region,
    platforms,
    format,
    offerType,
    ctaStrategy,
    suggestionTitle: selectedConcept?.title,
    suggestionDescription: selectedConcept?.description,
  }

  const ready = Boolean(intelligence)
    && !validateSourceUrl(sourceUrl)
    && isCampaignBriefComplete(brief)
    && Boolean(selectedConcept)

  async function analyzeSource() {
    const validationError = validateSourceUrl(sourceUrl)
    if (validationError) {
      setError(validationError)
      return
    }

    setAnalyzing(true)
    setError('')

    try {
      const response = await fetch('/api/enterprise/url-intelligence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceUrl }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok || !payload?.ok || !payload?.result) {
        throw new Error(payload?.error || 'URL analysis failed.')
      }

      const result = payload.result as UrlIntelligenceResult
      setIntelligence(result)
      setSourceUrl(result.finalUrl || result.sourceUrl)
      setGoal(result.detected.goal.value)
      setAudiences(result.detected.audiences.map((item) => item.value))
      setTone(result.detected.tone.value)
      setRegion(result.detected.region.value)
      setPlatforms(result.detected.platforms.map((item) => item.value))
      setFormat(result.detected.format.value)
      setOfferType(result.detected.offerType.value)
      setCtaStrategy(result.detected.ctaStrategy.value)
    } catch (value) {
      setIntelligence(null)
      setError(value instanceof Error ? value.message : uiCopy('u_369f987a1fb1bf6a'))
    } finally {
      setAnalyzing(false)
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!intelligence) {
      setError(uiCopy('u_8427e3168bc95759'))
      return
    }
    if (!ready) {
      setError(uiCopy('u_9217ddcb9615bd41'))
      return
    }

    setError('')
    const audienceLabels = audiences
      .map((value) => enterpriseOptions.audiences.find((option) => option.value === value)?.label || value)
      .join(', ')

    await onSubmit({
      businessName: intelligence.organization || intelligence.title || new URL(sourceUrl).hostname,
      promotion: buildCampaignDirective(brief),
      audience: audienceLabels,
      tone,
      websiteUrl: intelligence.finalUrl || intelligence.sourceUrl,
    })
  }

  function reset() {
    setSourceUrl('')
    setGoal('')
    setAudiences([])
    setTone('')
    setRegion('')
    setPlatforms([])
    setFormat('')
    setOfferType('')
    setCtaStrategy('')
    setConcept('authority')
    setIntelligence(null)
    setError('')
    onReset?.()
  }

  return (
    <form onSubmit={submit} style={{ display: 'grid', gap: 14 }}>
      <SourceUrlField
        label={uiCopy('u_e84f9a3558b13139')}
        value={sourceUrl}
        onChange={(value) => {
          setSourceUrl(value)
          setIntelligence(null)
        }}
        required
        helperText={uiCopy('u_acb46bcc528bddad')}
      />

      <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
        <button
          type="button"
          onClick={analyzeSource}
          disabled={busy || analyzing || Boolean(validateSourceUrl(sourceUrl))}
          style={{
            border: '1px solid rgba(255,195,0,.35)',
            background: 'rgba(255,195,0,.1)',
            color: '#ffc300',
            borderRadius: 12,
            padding: '10px 14px',
            fontWeight: 900,
            cursor: analyzing ? 'wait' : 'pointer',
            opacity: busy || analyzing || Boolean(validateSourceUrl(sourceUrl)) ? 0.55 : 1,
          }}
        >
          {analyzing ? uiCopy('u_90cf835bd785ee2c') : uiCopy('u_d279f9201e903ca7')}
        </button>
      </div>

      {intelligence && (
        <section
          aria-live="polite"
          style={{
            border: '1px solid rgba(255,195,0,.25)',
            borderRadius: 14,
            background: 'rgba(255,195,0,.06)',
            padding: 14,
          }}
        >
          <p style={{ margin: 0, color: '#ffc300', fontSize: 12, fontWeight: 900 }}>{uiCopy('u_7012147b77f7fc0c')}{intelligence.sourceType}
          </p>
          <h3 style={{ color: '#fff', margin: '8px 0 4px', fontSize: 16 }}>
            {intelligence.title || intelligence.organization || uiCopy('u_9c439c49c29af677')}
          </h3>
          <p style={{ color: 'rgba(255,255,255,.68)', margin: 0, lineHeight: 1.5 }}>
            {intelligence.description || uiCopy('u_838cb071898efea9')}
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
            <span style={{ color: '#fff', fontSize: 11 }}>{uiCopy('u_16889f775f178b77')}{intelligence.detected.goal.confidence}%</span>
            <span style={{ color: '#fff', fontSize: 11 }}>{uiCopy('u_067f6d72279b0838')}{intelligence.detected.tone.confidence}%</span>
            <span style={{ color: '#fff', fontSize: 11 }}>{uiCopy('u_998c26d160695c48')}{intelligence.detected.region.confidence}%</span>
            <span style={{ color: '#fff', fontSize: 11 }}>{uiCopy('u_1155c36e89fa3ab4')}{intelligence.detected.format.confidence}%</span>
          </div>
          {intelligence.requiresConfirmation.length > 0 && (
            <p style={{ color: '#ffc300', margin: '10px 0 0', fontSize: 12 }}>{uiCopy('u_bd9bdeaa7b68e972')}{intelligence.requiresConfirmation.join(', ')}{uiCopy('u_57f5d15c173ca514')}</p>
          )}
        </section>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
        <SearchableSelect label={uiCopy('u_2dbd965beb155bce')} options={enterpriseOptions.goals} value={goal} onChange={setGoal} required />
        <SearchableMultiSelect label={uiCopy('u_f07fb5753d96af0e')} options={enterpriseOptions.audiences} values={audiences} onChange={setAudiences} />
        <SearchableSelect label={uiCopy('u_cc044631313e5600')} options={enterpriseOptions.tones} value={tone} onChange={setTone} required />
        <SearchableSelect label={uiCopy('u_703a9f4c7e013163')} options={enterpriseOptions.regions} value={region} onChange={setRegion} required />
        <SearchableMultiSelect label={uiCopy('u_362b89a19dcb59f1')} options={enterpriseOptions.platforms} values={platforms} onChange={setPlatforms} />
        <SearchableSelect label={uiCopy('u_6579885cd57aacd3')} options={enterpriseOptions.formats} value={format} onChange={setFormat} required />
        <SearchableSelect label={uiCopy('u_0bda27d5e0dcca01')} options={enterpriseOptions.offer_types} value={offerType} onChange={setOfferType} required />
        <SearchableSelect label={uiCopy('u_b4669bc55ec221bc')} options={enterpriseOptions.cta_strategies} value={ctaStrategy} onChange={setCtaStrategy} required />
      </div>

      <SuggestionCardGrid
        label={uiCopy('u_fe9fdd2218b13f73')}
        suggestions={concepts}
        selectedId={concept}
        onSelect={setConcept}
      />

      {error && <p role="alert" style={{ color: '#fca5a5', margin: 0 }}>{error}</p>}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={reset}
          disabled={busy || analyzing}
          style={{
            border: '1px solid rgba(255,255,255,.15)',
            background: 'rgba(255,255,255,.06)',
            color: '#fff',
            borderRadius: 12,
            padding: '10px 14px',
            fontWeight: 800,
          }}
        >{uiCopy('u_d0d58834d74115a5')}</button>
        <button
          type="submit"
          disabled={busy || analyzing || !ready}
          style={{
            border: 'none',
            background: '#ffc300',
            color: '#000',
            borderRadius: 12,
            padding: '10px 14px',
            fontWeight: 900,
            cursor: busy || analyzing ? 'wait' : 'pointer',
            opacity: busy || analyzing || !ready ? 0.55 : 1,
          }}
        >
          {busy ? uiCopy('u_337a5600d24cb518') : uiCopy('u_4045562f5e9cc98f')}
        </button>
      </div>
      <input type="hidden" name="language" value={language} readOnly />
    </form>
  )
}
