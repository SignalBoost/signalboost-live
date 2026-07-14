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
    title: 'Business authority',
    description: 'Lead with credibility, proof, and a clear business outcome.',
    metadata: ['Trust', 'Proof', 'Value'],
  },
  {
    id: 'offer',
    title: 'Offer-led campaign',
    description: 'Present the strongest source-backed offer and move customers toward action.',
    metadata: ['Offer', 'Urgency', 'CTA'],
  },
  {
    id: 'education',
    title: 'Educational campaign',
    description: 'Explain the customer problem and solution before presenting the next step.',
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
      setError(value instanceof Error ? value.message : 'URL analysis failed.')
    } finally {
      setAnalyzing(false)
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!intelligence) {
      setError('Analyze the source URL before building the campaign.')
      return
    }
    if (!ready) {
      setError('Review the analyzed source and complete every required campaign option.')
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
        label="Website or GitHub source"
        value={sourceUrl}
        onChange={(value) => {
          setSourceUrl(value)
          setIntelligence(null)
        }}
        required
        helperText="Campaign Studio analyzes this public source and proposes a structured campaign brief."
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
          {analyzing ? 'Analyzing source…' : 'Analyze and prefill'}
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
          <p style={{ margin: 0, color: '#ffc300', fontSize: 12, fontWeight: 900 }}>
            Source intelligence ready · {intelligence.sourceType}
          </p>
          <h3 style={{ color: '#fff', margin: '8px 0 4px', fontSize: 16 }}>
            {intelligence.title || intelligence.organization || 'Analyzed source'}
          </h3>
          <p style={{ color: 'rgba(255,255,255,.68)', margin: 0, lineHeight: 1.5 }}>
            {intelligence.description || 'No source description was available.'}
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
            <span style={{ color: '#fff', fontSize: 11 }}>Goal {intelligence.detected.goal.confidence}%</span>
            <span style={{ color: '#fff', fontSize: 11 }}>Tone {intelligence.detected.tone.confidence}%</span>
            <span style={{ color: '#fff', fontSize: 11 }}>Region {intelligence.detected.region.confidence}%</span>
            <span style={{ color: '#fff', fontSize: 11 }}>Format {intelligence.detected.format.confidence}%</span>
          </div>
          {intelligence.requiresConfirmation.length > 0 && (
            <p style={{ color: '#ffc300', margin: '10px 0 0', fontSize: 12 }}>
              Review recommended for: {intelligence.requiresConfirmation.join(', ')}. The selections below remain editable before approval.
            </p>
          )}
        </section>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
        <SearchableSelect label="Goal" options={enterpriseOptions.goals} value={goal} onChange={setGoal} required />
        <SearchableMultiSelect label="Audience" options={enterpriseOptions.audiences} values={audiences} onChange={setAudiences} />
        <SearchableSelect label="Tone" options={enterpriseOptions.tones} value={tone} onChange={setTone} required />
        <SearchableSelect label="Region" options={enterpriseOptions.regions} value={region} onChange={setRegion} required />
        <SearchableMultiSelect label="Platforms" options={enterpriseOptions.platforms} values={platforms} onChange={setPlatforms} />
        <SearchableSelect label="Format" options={enterpriseOptions.formats} value={format} onChange={setFormat} required />
        <SearchableSelect label="Offer type" options={enterpriseOptions.offer_types} value={offerType} onChange={setOfferType} required />
        <SearchableSelect label="CTA strategy" options={enterpriseOptions.cta_strategies} value={ctaStrategy} onChange={setCtaStrategy} required />
      </div>

      <SuggestionCardGrid
        label="Creative direction"
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
        >
          Reset
        </button>
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
          {busy ? 'Building campaign…' : 'Approve brief and build campaign'}
        </button>
      </div>
      <input type="hidden" name="language" value={language} readOnly />
    </form>
  )
}
