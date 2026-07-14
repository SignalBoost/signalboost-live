'use client'

import { useMemo, useState, type FormEvent } from 'react'
import { SearchableMultiSelect, SearchableSelect, SourceUrlField, SuggestionCardGrid, validateSourceUrl, type SuggestionCard } from '@/components/enterprise'
import { enterpriseOptions } from '@/lib/enterprise/masterConfig'
import { buildCampaignDirective, isCampaignBriefComplete, type StructuredCampaignBrief } from '@/lib/enterprise/campaignBrief'

type CampaignRequest = {
  channel: 'youtube' | 'linkedin' | 'email' | 'outreach' | 'landing_page'
  outreach_channel?: 'trade-press'
  title: string
  objective: string
  audience: string
  signal: string
  sourceMaterial: string
  autonomous: true
}

type Submission = { directive: string; request: CampaignRequest }
type Props = { busy?: boolean; onSubmit: (submission: Submission) => Promise<void> | void }

const concepts: SuggestionCard[] = [
  { id: 'authority', title: 'Enterprise authority', description: 'Lead with credibility, operational control, and measurable business value.', metadata: ['Trust', 'ROI', 'Decision makers'] },
  { id: 'demonstration', title: 'Product demonstration', description: 'Show the product workflow and move the audience toward a concrete next step.', metadata: ['Demo', 'Proof', 'CTA'] },
  { id: 'education', title: 'Educational campaign', description: 'Teach the problem and solution clearly before presenting the offer.', metadata: ['Training', 'Clarity', 'Value'] },
]

const supportedPlatforms = enterpriseOptions.platforms.filter((option) => ['Website', 'Email', 'LinkedIn', 'YouTube', 'Press Outreach'].includes(option.value))

function requestForPlatform(platform: string, brief: StructuredCampaignBrief, directive: string): CampaignRequest {
  const channelMap: Record<string, CampaignRequest['channel']> = {
    Website: 'landing_page',
    Email: 'email',
    LinkedIn: 'linkedin',
    YouTube: 'youtube',
    'Press Outreach': 'outreach',
  }
  return {
    channel: channelMap[platform] || 'youtube',
    outreach_channel: platform === 'Press Outreach' ? 'trade-press' : undefined,
    title: brief.suggestionTitle || `Create a ${platform} campaign`,
    objective: directive,
    audience: brief.audiences.join(', '),
    signal: `Structured COSA configuration. Platform=${platform}; Region=${brief.region}; Tone=${brief.tone}; Goal=${brief.goal}.`,
    sourceMaterial: brief.sourceUrl,
    autonomous: true,
  }
}

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
  const selectedConcept = useMemo(() => concepts.find((item) => item.id === concept), [concept])
  const brief: StructuredCampaignBrief = { sourceUrl, goal, audiences, tone, region, platforms: platform ? [platform] : [], format, offerType, ctaStrategy, suggestionTitle: selectedConcept?.title, suggestionDescription: selectedConcept?.description }
  const ready = !validateSourceUrl(sourceUrl) && isCampaignBriefComplete(brief) && Boolean(selectedConcept)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!ready) { setError('Select a valid source and complete every required campaign option.'); return }
    setError('')
    const directive = buildCampaignDirective(brief)
    await onSubmit({ directive, request: requestForPlatform(platform, brief, directive) })
  }

  return <form onSubmit={submit} style={{ display: 'grid', gap: 14, marginTop: 16 }}>
    <SourceUrlField label="Website or GitHub source" value={sourceUrl} onChange={setSourceUrl} required helperText="COSA uses this public source as the factual basis for the campaign." />
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
    <SuggestionCardGrid label="Creative direction" suggestions={concepts} selectedId={concept} onSelect={setConcept} />
    {error && <p style={{ color: '#fca5a5', margin: 0 }}>{error}</p>}
    <div style={{ display: 'flex', justifyContent: 'flex-end' }}><button disabled={busy || !ready} style={{ border: 'none', background: '#ffc300', color: '#000', borderRadius: 12, padding: '10px 14px', fontWeight: 900, cursor: busy ? 'wait' : 'pointer', opacity: busy || !ready ? .55 : 1 }}>{busy ? 'Building campaign…' : 'Build governed campaign'}</button></div>
  </form>
}
