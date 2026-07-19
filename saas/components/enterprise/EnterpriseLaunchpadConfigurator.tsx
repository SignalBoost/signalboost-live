'use client'

import { LocalizedText } from '@/components/i18n/LocalizedText'

import { useMemo, useState } from 'react'
import { SearchableMultiSelect, SearchableSelect, SourceUrlField, SuggestionCardGrid, validateSourceUrl, type SuggestionCard } from '@/components/enterprise'
import { enterpriseOptions } from '@/lib/enterprise/masterConfig'
import type { UrlIntelligenceResult } from '@/lib/enterprise/url-intelligence/types'

export type LaunchpadWorkspace = 'business' | 'creator' | 'podcast' | 'store'
export type LaunchpadApprovalPackage = {
  workspace: LaunchpadWorkspace; sourceUrl: string; organization: string; description: string; industry: string
  audiences: string[]; region: string; language: string; goal: string; tone: string; format: string
  offerType: string; ctaStrategy: string; creativeDirection: string; confidence: Record<string, number>; requiresConfirmation: string[]
}
type Props = { workspace: LaunchpadWorkspace; busy?: boolean; onApprove: (value: LaunchpadApprovalPackage) => Promise<void> | void }

const directions: Record<LaunchpadWorkspace, SuggestionCard[]> = {
  business: [
    { id: 'authority', title: 'Business authority', description: 'Lead with trust, expertise, and measurable customer value.', metadata: ['Trust', 'Value', 'Growth'] },
    { id: 'demonstration', title: 'Service demonstration', description: 'Show how the organization solves a customer problem.', metadata: ['Proof', 'Workflow', 'CTA'] },
    { id: 'local', title: 'Local growth', description: 'Emphasize community relevance and customer outcomes.', metadata: ['Local', 'Community', 'Conversion'] },
  ],
  creator: [
    { id: 'education', title: 'Educational creator', description: 'Teach a useful idea and establish trusted authority.', metadata: ['Education', 'Authority', 'Audience'] },
    { id: 'story', title: 'Story-led creator', description: 'Build connection through a clear brand narrative.', metadata: ['Story', 'Identity', 'Community'] },
    { id: 'demonstration', title: 'Creator demonstration', description: 'Show the creator process or transformation.', metadata: ['Process', 'Proof', 'Follow'] },
  ],
  podcast: [
    { id: 'expert', title: 'Expert conversations', description: 'Build episodes around expert insight and practical takeaways.', metadata: ['Expert', 'Interview', 'Authority'] },
    { id: 'education', title: 'Educational series', description: 'Teach one clear lesson in each structured episode.', metadata: ['Learning', 'Series', 'Retention'] },
    { id: 'story', title: 'Narrative series', description: 'Organize the show around stories and memorable outcomes.', metadata: ['Story', 'Emotion', 'Episodes'] },
  ],
  store: [
    { id: 'proof', title: 'Product proof', description: 'Show product benefits, use cases, and reasons to buy.', metadata: ['Product', 'Proof', 'Conversion'] },
    { id: 'lifestyle', title: 'Lifestyle commerce', description: 'Connect products to customer identity and outcomes.', metadata: ['Lifestyle', 'Identity', 'Desire'] },
    { id: 'offer', title: 'Offer-led commerce', description: 'Lead with a bounded offer and clear purchase action.', metadata: ['Offer', 'Urgency', 'CTA'] },
  ],
}

function schemaLanguage(value?: string) {
  const code = (value || '').toLowerCase().split(/[-_]/)[0]
  return ({ en: 'English', es: 'Spanish', pt: 'Portuguese', pl: 'Polish', ru: 'Russian' } as Record<string, string>)[code] || 'English'
}

export function EnterpriseLaunchpadConfigurator({ workspace, busy = false, onApprove }: Props) {
  const cards = directions[workspace]
  const [sourceUrl, setSourceUrl] = useState(''); const [data, setData] = useState<UrlIntelligenceResult | null>(null)
  const [industry, setIndustry] = useState(''); const [audiences, setAudiences] = useState<string[]>([])
  const [region, setRegion] = useState(''); const [language, setLanguage] = useState(''); const [goal, setGoal] = useState('')
  const [tone, setTone] = useState(''); const [format, setFormat] = useState(''); const [offerType, setOfferType] = useState('')
  const [ctaStrategy, setCtaStrategy] = useState(''); const [direction, setDirection] = useState(cards[0]?.id || '')
  const [analyzing, setAnalyzing] = useState(false); const [error, setError] = useState('')
  const selected = useMemo(() => cards.find((item) => item.id === direction), [cards, direction])
  const ready = Boolean(data && industry && audiences.length && region && language && goal && tone && format && offerType && ctaStrategy && selected)

  async function analyze() {
    const invalid = validateSourceUrl(sourceUrl); if (invalid) return setError(invalid)
    setAnalyzing(true); setError('')
    try {
      const response = await fetch('/api/enterprise/url-intelligence', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sourceUrl }) })
      const payload = await response.json().catch(() => null)
      if (!response.ok || !payload?.ok || !payload?.result) throw new Error(payload?.error || 'URL analysis failed.')
      const result = payload.result as UrlIntelligenceResult
      setData(result); setSourceUrl(result.finalUrl || result.sourceUrl); setIndustry(result.detected.industry.value)
      setAudiences(result.detected.audiences.map((item) => item.value)); setRegion(result.detected.region.value)
      setLanguage(schemaLanguage(result.metadata.language)); setGoal(result.detected.goal.value); setTone(result.detected.tone.value)
      setFormat(result.detected.format.value); setOfferType(result.detected.offerType.value); setCtaStrategy(result.detected.ctaStrategy.value)
    } catch (value) { setData(null); setError(value instanceof Error ? value.message : 'URL analysis failed.') }
    finally { setAnalyzing(false) }
  }

  async function approve() {
    if (!data || !selected || !ready) return setError('Analyze the source and review every required launch option before approval.')
    const audienceConfidence = data.detected.audiences.length ? Math.min(...data.detected.audiences.map((item) => item.confidence)) : 0
    setError('')
    await onApprove({ workspace, sourceUrl: data.finalUrl || data.sourceUrl, organization: data.organization || data.title || '', description: data.description || '', industry, audiences, region, language, goal, tone, format, offerType, ctaStrategy, creativeDirection: selected.title, confidence: { industry: data.detected.industry.confidence, audience: audienceConfidence, region: data.detected.region.confidence, goal: data.detected.goal.confidence }, requiresConfirmation: data.requiresConfirmation })
  }

  return <section className="sb-glass-panel" style={{ padding: 20, display: 'grid', gap: 14 }} aria-labelledby={`${workspace}-profile`}>
    <h2 id={`${workspace}-profile`} style={{ margin: 0, fontSize: 18 }}><LocalizedText fallback={"Enterprise launch profile"} /></h2>
    <SourceUrlField label="Website or GitHub source" helperText="Analyze a public source to build a structured launch profile." value={sourceUrl} onChange={(value) => { setSourceUrl(value); setData(null) }} required />
    <div><button type="button" className="sb-button-secondary" onClick={analyze} disabled={busy || analyzing || Boolean(validateSourceUrl(sourceUrl))}>{analyzing ? 'Analyzing source…' : 'Analyze and prefill'}</button></div>
    {data && <div role="status" aria-live="polite" style={{ border: '1px solid rgba(26,240,255,.25)', borderRadius: 14, padding: 14, background: 'rgba(26,240,255,.06)' }}>
      <strong style={{ color: '#1af0ff' }}><LocalizedText fallback={"Enterprise intelligence ready"} /></strong><h3 style={{ margin: '8px 0 4px' }}>{data.organization || data.title || 'Analyzed organization'}</h3>
      <p style={{ margin: 0, color: 'rgba(255,255,255,.68)' }}>{data.description || 'No public description was available.'}</p>
      <p style={{ margin: '10px 0 0', fontSize: 12 }}>Industry {data.detected.industry.confidence}% · Region {data.detected.region.confidence}% · Language {schemaLanguage(data.metadata.language)}</p>
      {data.requiresConfirmation.length > 0 && <p style={{ color: '#ffc300', margin: '8px 0 0', fontSize: 12 }}>Review recommended for: {data.requiresConfirmation.join(', ')}.</p>}
    </div>}
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
      <SearchableSelect label="Industry" options={enterpriseOptions.industries} value={industry} onChange={setIndustry} required />
      <SearchableMultiSelect label="Audience" options={enterpriseOptions.audiences} values={audiences} onChange={setAudiences} />
      <SearchableSelect label="Region" options={enterpriseOptions.regions} value={region} onChange={setRegion} required />
      <SearchableSelect label="Language" options={enterpriseOptions.languages} value={language} onChange={setLanguage} required />
      <SearchableSelect label="Goal" options={enterpriseOptions.goals} value={goal} onChange={setGoal} required />
      <SearchableSelect label="Tone" options={enterpriseOptions.tones} value={tone} onChange={setTone} required />
      <SearchableSelect label="Format" options={enterpriseOptions.formats} value={format} onChange={setFormat} required />
      <SearchableSelect label="Offer type" options={enterpriseOptions.offer_types} value={offerType} onChange={setOfferType} required />
      <SearchableSelect label="CTA strategy" options={enterpriseOptions.cta_strategies} value={ctaStrategy} onChange={setCtaStrategy} required />
    </div>
    <SuggestionCardGrid label="Launch direction" suggestions={cards} selectedId={direction} onSelect={setDirection} />
    {error && <p role="alert" style={{ margin: 0, color: '#fca5a5' }}>{error}</p>}
    <div style={{ display: 'flex', justifyContent: 'flex-end' }}><button type="button" className="sb-button-primary" onClick={approve} disabled={busy || analyzing || !ready}>{busy ? 'Saving approval…' : 'Approve launch profile'}</button></div>
  </section>
}
