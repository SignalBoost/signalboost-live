'use client'

import { useMemo, useState, type FormEvent } from 'react'
import { SearchableMultiSelect, SearchableSelect, SourceUrlField, SuggestionCardGrid, validateSourceUrl, type SuggestionCard } from '@/components/enterprise'
import { enterpriseOptions } from '@/lib/enterprise/masterConfig'
import { buildCampaignDirective, isCampaignBriefComplete, type StructuredCampaignBrief } from '@/lib/enterprise/campaignBrief'
import type { UrlIntelligenceResult } from '@/lib/enterprise/url-intelligence/types'

type Props = { busy?: boolean; onSubmit: (directive: string) => Promise<void> | void }

const concepts: SuggestionCard[] = [
  { id: 'authority', title: 'Enterprise authority', description: 'Lead with credibility, operational control, and measurable business value.', metadata: ['Trust', 'ROI', 'Decision makers'] },
  { id: 'demonstration', title: 'Product demonstration', description: 'Show the product workflow and move the audience toward a concrete next step.', metadata: ['Demo', 'Proof', 'CTA'] },
  { id: 'education', title: 'Educational campaign', description: 'Teach the problem and solution clearly before presenting the offer.', metadata: ['Training', 'Clarity', 'Value'] },
]

const supportedPlatforms = enterpriseOptions.platforms.filter((option) => option.value === 'YouTube')

export function CosaCampaignConfigurator({ busy, onSubmit }: Props) {
  const [sourceUrl, setSourceUrl] = useState('')
  const [goal, setGoal] = useState('')
  const [audiences, setAudiences] = useState<string[]>([])
  const [tone, setTone] = useState('')
  const [region, setRegion] = useState('')
  const [platform, setPlatform] = useState('')
  const [format, setFormat] = useState('')
  const [offerType, setOfferType] = useState('')
  const [ctaStrategy, setCtaStrategy] = useState('')
  const [concept, setConcept] = useState('authority')
  const [error, setError] = useState('')
  const [analyzing, setAnalyzing] = useState(false)
  const [intelligence, setIntelligence] = useState<UrlIntelligenceResult | null>(null)
  const selectedConcept = useMemo(() => concepts.find((item) => item.id === concept), [concept])
  const brief: StructuredCampaignBrief = { sourceUrl, goal, audiences, tone, region, platforms: platform ? [platform] : [], format, offerType, ctaStrategy, suggestionTitle: selectedConcept?.title, suggestionDescription: selectedConcept?.description }
  const ready = Boolean(intelligence) && !validateSourceUrl(sourceUrl) && isCampaignBriefComplete(brief) && Boolean(selectedConcept)

  async function analyzeSource() {
    const validationError = validateSourceUrl(sourceUrl)
    if (validationError) { setError(validationError); return }
    setAnalyzing(true)
    setError('')
    try {
      const response = await fetch('/api/enterprise/url-intelligence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceUrl }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok || !payload?.ok || !payload?.result) throw new Error(payload?.error || 'URL analysis failed.')
      const result = payload.result as UrlIntelligenceResult
      setIntelligence(result)
      setSourceUrl(result.finalUrl || result.sourceUrl)
      setGoal(result.detected.goal.value)
      setAudiences(result.detected.audiences.map((item) => item.value))
      setTone(result.detected.tone.value)
      setRegion(result.detected.region.value)
      setPlatform(result.detected.platforms.some((item) => item.value === 'YouTube') ? 'YouTube' : 'YouTube')
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
    if (!intelligence) { setError('Analyze the source URL before building the campaign.'); return }
    if (!ready) { setError('Review the analyzed source and complete every required campaign option.'); return }
    setError('')
    await onSubmit(`${buildCampaignDirective(brief)} Primary distribution platform: ${platform}. Source analysis title: ${intelligence.title}. Source analysis description: ${intelligence.description}.`)
  }

  return <form onSubmit={submit} style={{ display: 'grid', gap: 14, marginTop: 16 }}>
    <SourceUrlField label="Website or GitHub source" value={sourceUrl} onChange={(value) => { setSourceUrl(value); setIntelligence(null) }} required helperText="COSA analyzes this public source and proposes a structured campaign brief." />
    <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
      <button type="button" onClick={analyzeSource} disabled={busy || analyzing || Boolean(validateSourceUrl(sourceUrl))} style={{ border: '1px solid rgba(26,240,255,.35)', background: 'rgba(26,240,255,.1)', color: '#1af0ff', borderRadius: 12, padding: '10px 14px', fontWeight: 900, cursor: analyzing ? 'wait' : 'pointer', opacity: busy || analyzing || Boolean(validateSourceUrl(sourceUrl)) ? .55 : 1 }}>{analyzing ? 'Analyzing source…' : 'Analyze and prefill'}</button>
    </div>
    {intelligence && <section style={{ border: '1px solid rgba(26,240,255,.25)', borderRadius: 14, background: 'rgba(26,240,255,.06)', padding: 14 }}>
      <p style={{ margin: 0, color: '#1af0ff', fontSize: 12, fontWeight: 900 }}>Source intelligence ready · {intelligence.sourceType}</p>
      <h3 style={{ color: '#fff', margin: '8px 0 4px', fontSize: 16 }}>{intelligence.title || intelligence.organization || 'Analyzed source'}</h3>
      <p style={{ color: 'rgba(255,255,255,.68)', margin: 0, lineHeight: 1.5 }}>{intelligence.description || 'No source description was available.'}</p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
        <span style={{ color: '#fff', fontSize: 11 }}>Goal {intelligence.detected.goal.confidence}%</span>
        <span style={{ color: '#fff', fontSize: 11 }}>Tone {intelligence.detected.tone.confidence}%</span>
        <span style={{ color: '#fff', fontSize: 11 }}>Region {intelligence.detected.region.confidence}%</span>
        <span style={{ color: '#fff', fontSize: 11 }}>Format {intelligence.detected.format.confidence}%</span>
      </div>
      {intelligence.requiresConfirmation.length > 0 && <p style={{ color: '#ffc300', margin: '10px 0 0', fontSize: 12 }}>Review recommended for: {intelligence.requiresConfirmation.join(', ')}. The selections below remain editable before approval.</p>}
    </section>}
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
      <SearchableSelect label="Goal" options={enterpriseOptions.goals} value={goal} onChange={setGoal} required />
      <SearchableMultiSelect label="Audience" options={enterpriseOptions.audiences} values={audiences} onChange={setAudiences} />
      <SearchableSelect label="Tone" options={enterpriseOptions.tones} value={tone} onChange={setTone} required />
      <SearchableSelect label="Region" options={enterpriseOptions.regions} value={region} onChange={setRegion} required />
      <SearchableSelect label="Platform" options={supportedPlatforms} value={platform} onChange={setPlatform} required />
      <SearchableSelect label="Format" options={enterpriseOptions.formats} value={format} onChange={setFormat} required />
      <SearchableSelect label="Offer type" options={enterpriseOptions.offer_types} value={offerType} onChange={setOfferType} required />
      <SearchableSelect label="CTA strategy" options={enterpriseOptions.cta_strategies} value={ctaStrategy} onChange={setCtaStrategy} required />
    </div>
    <p style={{ margin: 0, color: 'rgba(255,255,255,.55)', fontSize: 11 }}>COSA currently supports governed YouTube execution. Additional platforms will be enabled only when their queue mappings are implemented.</p>
    <SuggestionCardGrid label="Creative direction" suggestions={concepts} selectedId={concept} onSelect={setConcept} />
    {error && <p style={{ color: '#fca5a5', margin: 0 }}>{error}</p>}
    <div style={{ display: 'flex', justifyContent: 'flex-end' }}><button disabled={busy || analyzing || !ready} style={{ border: 'none', background: '#ffc300', color: '#000', borderRadius: 12, padding: '10px 14px', fontWeight: 900, cursor: busy || analyzing ? 'wait' : 'pointer', opacity: busy || analyzing || !ready ? .55 : 1 }}>{busy ? 'Building campaign…' : 'Approve brief and build campaign'}</button></div>
  </form>
}
