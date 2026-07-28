'use client'

import { LocalizedText } from '@/components/i18n/LocalizedText'

import { useMemo, useState } from 'react'
import { SearchableMultiSelect, SearchableSelect, SourceUrlField, SuggestionCardGrid, validateSourceUrl, type SuggestionCard } from '@/components/enterprise'
import { enterpriseOptions } from '@/lib/enterprise/masterConfig'
import type { UrlIntelligenceResult } from '@/lib/enterprise/url-intelligence/types'
import { uiCopy } from '@/lib/i18n/generatedUiCopy'


export type LaunchpadWorkspace = 'business' | 'creator' | 'podcast' | 'store'
export type LaunchpadApprovalPackage = {
  workspace: LaunchpadWorkspace; sourceUrl: string; organization: string; description: string; industry: string
  audiences: string[]; region: string; language: string; goal: string; tone: string; format: string
  offerType: string; ctaStrategy: string; creativeDirection: string; confidence: Record<string, number>; requiresConfirmation: string[]
}
type Props = { workspace: LaunchpadWorkspace; busy?: boolean; onApprove: (value: LaunchpadApprovalPackage) => Promise<void> | void }

const directions: Record<LaunchpadWorkspace, SuggestionCard[]> = {
  business: [
    { id: 'authority', title: uiCopy('u_494049e6d9ff2f88'), description: uiCopy('u_3efd44bc351618ec'), metadata: ['Trust', 'Value', 'Growth'] },
    { id: 'demonstration', title: uiCopy('u_d8956fee9a48ef47'), description: uiCopy('u_9afdd888849d4672'), metadata: ['Proof', 'Workflow', 'CTA'] },
    { id: 'local', title: uiCopy('u_2ce806e478776269'), description: uiCopy('u_4f9c661181035961'), metadata: ['Local', 'Community', 'Conversion'] },
  ],
  creator: [
    { id: 'education', title: uiCopy('u_7ed97d7e4e160cbd'), description: uiCopy('u_26cfe9aca7659dbf'), metadata: ['Education', 'Authority', 'Audience'] },
    { id: 'story', title: uiCopy('u_ed40eca7b174722e'), description: uiCopy('u_27d9e45886c223ce'), metadata: ['Story', 'Identity', 'Community'] },
    { id: 'demonstration', title: uiCopy('u_bacbb4b4345118eb'), description: uiCopy('u_1a55f93a4c46f9fe'), metadata: ['Process', 'Proof', 'Follow'] },
  ],
  podcast: [
    { id: 'expert', title: uiCopy('u_870679dde5dbb845'), description: uiCopy('u_50f4b7015840d588'), metadata: ['Expert', 'Interview', 'Authority'] },
    { id: 'education', title: uiCopy('u_7659ddb4c849ca07'), description: uiCopy('u_b4c4e87197f0c941'), metadata: ['Learning', 'Series', 'Retention'] },
    { id: 'story', title: uiCopy('u_c00216aa4acdc002'), description: uiCopy('u_9a555d36dc4e7894'), metadata: ['Story', 'Emotion', 'Episodes'] },
  ],
  store: [
    { id: 'proof', title: uiCopy('u_3fb8e6026bb29a8e'), description: uiCopy('u_19521c2d708c158e'), metadata: ['Product', 'Proof', 'Conversion'] },
    { id: 'lifestyle', title: uiCopy('u_d6f1fa011e976d7e'), description: uiCopy('u_426e3b7718e5247f'), metadata: ['Lifestyle', 'Identity', 'Desire'] },
    { id: 'offer', title: uiCopy('u_3064fb651e52ec02'), description: uiCopy('u_9c96a0ee9a9dbe63'), metadata: ['Offer', 'Urgency', 'CTA'] },
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
    } catch (value) { setData(null); setError(value instanceof Error ? value.message : uiCopy('u_50cfcf7074557093')) }
    finally { setAnalyzing(false) }
  }

  async function approve() {
    if (!data || !selected || !ready) return setError(uiCopy('u_703a2de2f64846dd'))
    const audienceConfidence = data.detected.audiences.length ? Math.min(...data.detected.audiences.map((item) => item.confidence)) : 0
    setError('')
    await onApprove({ workspace, sourceUrl: data.finalUrl || data.sourceUrl, organization: data.organization || data.title || '', description: data.description || '', industry, audiences, region, language, goal, tone, format, offerType, ctaStrategy, creativeDirection: selected.title, confidence: { industry: data.detected.industry.confidence, audience: audienceConfidence, region: data.detected.region.confidence, goal: data.detected.goal.confidence }, requiresConfirmation: data.requiresConfirmation })
  }

  return <section className="sb-glass-panel" style={{ padding: 20, display: 'grid', gap: 14 }} aria-labelledby={`${workspace}-profile`}>
    <h2 id={`${workspace}-profile`} style={{ margin: 0, fontSize: 18 }}><LocalizedText fallback={uiCopy('u_84c4ee9a231f6f3c')} /></h2>
    <SourceUrlField label={uiCopy('u_0ee502a02bad445d')} helperText={uiCopy('u_10b6307e29cd4e31')} value={sourceUrl} onChange={(value) => { setSourceUrl(value); setData(null) }} required />
    <div><button type="button" className="sb-button-secondary" onClick={analyze} disabled={busy || analyzing || Boolean(validateSourceUrl(sourceUrl))}>{analyzing ? uiCopy('u_89124c817cc0b9ac') : uiCopy('u_c949e4d18c06ef5c')}</button></div>
    {data && <div role="status" aria-live="polite" style={{ border: '1px solid rgba(26,240,255,.25)', borderRadius: 14, padding: 14, background: 'rgba(26,240,255,.06)' }}>
      <strong style={{ color: '#1af0ff' }}><LocalizedText fallback={uiCopy('u_8d4b1aa6a7fc9db4')} /></strong><h3 style={{ margin: '8px 0 4px' }}>{data.organization || data.title || uiCopy('u_9bc1fd2003540366')}</h3>
      <p style={{ margin: 0, color: 'rgba(255,255,255,.68)' }}>{data.description || uiCopy('u_339df98e903f992b')}</p>
      <p style={{ margin: '10px 0 0', fontSize: 12 }}>{uiCopy('u_b122123a90102f43')}{data.detected.industry.confidence}{uiCopy('u_142f7b33b8ad1c3c')}{data.detected.region.confidence}{uiCopy('u_00ba40726f844352')}{schemaLanguage(data.metadata.language)}</p>
      {data.requiresConfirmation.length > 0 && <p style={{ color: '#ffc300', margin: '8px 0 0', fontSize: 12 }}>{uiCopy('u_69dd8b61f7db2106')}{data.requiresConfirmation.join(', ')}.</p>}
    </div>}
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
      <SearchableSelect label={uiCopy('u_6efbd214f6801ff9')} options={enterpriseOptions.industries} value={industry} onChange={setIndustry} required />
      <SearchableMultiSelect label={uiCopy('u_b7897aad5df55ccb')} options={enterpriseOptions.audiences} values={audiences} onChange={setAudiences} />
      <SearchableSelect label={uiCopy('u_7144b0c0d5e375ab')} options={enterpriseOptions.regions} value={region} onChange={setRegion} required />
      <SearchableSelect label={uiCopy('u_aa11645e20963953')} options={enterpriseOptions.languages} value={language} onChange={setLanguage} required />
      <SearchableSelect label={uiCopy('u_376b96b2158dcbcd')} options={enterpriseOptions.goals} value={goal} onChange={setGoal} required />
      <SearchableSelect label={uiCopy('u_9b4ca290890a2b46')} options={enterpriseOptions.tones} value={tone} onChange={setTone} required />
      <SearchableSelect label={uiCopy('u_b5795cfe3bf73427')} options={enterpriseOptions.formats} value={format} onChange={setFormat} required />
      <SearchableSelect label={uiCopy('u_c9bc2514544ee245')} options={enterpriseOptions.offer_types} value={offerType} onChange={setOfferType} required />
      <SearchableSelect label={uiCopy('u_2244ab3fb7be2ac0')} options={enterpriseOptions.cta_strategies} value={ctaStrategy} onChange={setCtaStrategy} required />
    </div>
    <SuggestionCardGrid label={uiCopy('u_e05c31c590911706')} suggestions={cards} selectedId={direction} onSelect={setDirection} />
    {error && <p role="alert" style={{ margin: 0, color: '#fca5a5' }}>{error}</p>}
    <div style={{ display: 'flex', justifyContent: 'flex-end' }}><button type="button" className="sb-button-primary" onClick={approve} disabled={busy || analyzing || !ready}>{busy ? uiCopy('u_46629ec39987ccac') : uiCopy('u_2b612cf31a7ea4d6')}</button></div>
  </section>
}
