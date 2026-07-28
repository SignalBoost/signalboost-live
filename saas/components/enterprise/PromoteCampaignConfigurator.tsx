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
import { uiText } from '@/lib/i18n/uiText'

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
    title: uiText('generatedUi.u_3f5a006d7dae44cd'),
    description: uiText('generatedUi.u_60dd20f50e330a00'),
    metadata: ['Trust', 'Proof', 'Value'],
  },
  {
    id: 'offer',
    title: uiText('generatedUi.u_8fe54beff6b44678'),
    description: uiText('generatedUi.u_6f9d02612c2fc51a'),
    metadata: ['Offer', 'Urgency', 'CTA'],
  },
  {
    id: 'education',
    title: uiText('generatedUi.u_19b761b533fb818c'),
    description: uiText('generatedUi.u_d1bbebc6f5ff109f'),
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
      setError(value instanceof Error ? value.message : "URL analysis failed.")
    } finally {
      setAnalyzing(false)
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!intelligence) {
      setError("Analyze the source URL before building the campaign.")
      return
    }
    if (!ready) {
      setError("Review the analyzed source and complete every required campaign option.")
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
        label={uiText('generatedUi.u_3024d9fd1e6be7fd')}
        value={sourceUrl}
        onChange={(value) => {
          setSourceUrl(value)
          setIntelligence(null)
        }}
        required
        helperText={uiText('generatedUi.u_0e622651007896e5')}
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
          {analyzing ? uiText('generatedUi.u_2bfac71b180af5fa') : uiText('generatedUi.u_8db4b7da61625c04')}
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
          <p style={{ margin: 0, color: '#ffc300', fontSize: 12, fontWeight: 900 }}>{uiText('generatedUi.u_2ba46efce3f1c658')}{intelligence.sourceType}
          </p>
          <h3 style={{ color: '#fff', margin: '8px 0 4px', fontSize: 16 }}>
            {intelligence.title || intelligence.organization || uiText('generatedUi.u_b15d4e7cbfbc6316')}
          </h3>
          <p style={{ color: 'rgba(255,255,255,.68)', margin: 0, lineHeight: 1.5 }}>
            {intelligence.description || uiText('generatedUi.u_f4b0fe973ed3a0e7')}
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
            <span style={{ color: '#fff', fontSize: 11 }}>{uiText('generatedUi.u_cdbf6975e8a35b0d')}{intelligence.detected.goal.confidence}%</span>
            <span style={{ color: '#fff', fontSize: 11 }}>{uiText('generatedUi.u_c2c8b72e302ec730')}{intelligence.detected.tone.confidence}%</span>
            <span style={{ color: '#fff', fontSize: 11 }}>{uiText('generatedUi.u_d3a008ef1335692d')}{intelligence.detected.region.confidence}%</span>
            <span style={{ color: '#fff', fontSize: 11 }}>{uiText('generatedUi.u_2f343666aaa88c44')}{intelligence.detected.format.confidence}%</span>
          </div>
          {intelligence.requiresConfirmation.length > 0 && (
            <p style={{ color: '#ffc300', margin: '10px 0 0', fontSize: 12 }}>{uiText('generatedUi.u_32644c86d8172bde')}{intelligence.requiresConfirmation.join(', ')}{uiText('generatedUi.u_e28cd7b6575727f1')}</p>
          )}
        </section>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
        <SearchableSelect label={uiText('generatedUi.u_cdbf6975e8a35b0d')} options={enterpriseOptions.goals} value={goal} onChange={setGoal} required />
        <SearchableMultiSelect label={uiText('generatedUi.u_545c02357695a6ff')} options={enterpriseOptions.audiences} values={audiences} onChange={setAudiences} />
        <SearchableSelect label={uiText('generatedUi.u_c2c8b72e302ec730')} options={enterpriseOptions.tones} value={tone} onChange={setTone} required />
        <SearchableSelect label={uiText('generatedUi.u_d3a008ef1335692d')} options={enterpriseOptions.regions} value={region} onChange={setRegion} required />
        <SearchableMultiSelect label={uiText('generatedUi.u_ab9bd7584a6270cd')} options={enterpriseOptions.platforms} values={platforms} onChange={setPlatforms} />
        <SearchableSelect label={uiText('generatedUi.u_2f343666aaa88c44')} options={enterpriseOptions.formats} value={format} onChange={setFormat} required />
        <SearchableSelect label={uiText('generatedUi.u_2a8e278e97755982')} options={enterpriseOptions.offer_types} value={offerType} onChange={setOfferType} required />
        <SearchableSelect label={uiText('generatedUi.u_0b28778c262112ff')} options={enterpriseOptions.cta_strategies} value={ctaStrategy} onChange={setCtaStrategy} required />
      </div>

      <SuggestionCardGrid
        label={uiText('generatedUi.u_955fe28d6fc25bcd')}
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
        >{uiText('generatedUi.u_daee7606b339f3c3')}</button>
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
          {busy ? uiText('generatedUi.u_5968f960f77a58a8') : uiText('generatedUi.u_4189932d0b20e615')}
        </button>
      </div>
      <input type="hidden" name="language" value={language} readOnly />
    </form>
  )
}
