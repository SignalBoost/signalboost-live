'use client'

import { LocalizedText } from '@/components/i18n/LocalizedText'

import { useMemo, useState } from 'react'
import { SearchableMultiSelect, SearchableSelect, SourceUrlField, SuggestionCardGrid, validateSourceUrl, type SuggestionCard } from '@/components/enterprise'
import { enterpriseOptions } from '@/lib/enterprise/masterConfig'
import type { UrlIntelligenceResult } from '@/lib/enterprise/url-intelligence/types'
import { uiText } from '@/lib/i18n/uiText'

export type LaunchpadWorkspace = 'business' | 'creator' | 'podcast' | 'store'
export type LaunchpadApprovalPackage = {
  workspace: LaunchpadWorkspace; sourceUrl: string; organization: string; description: string; industry: string
  audiences: string[]; region: string; language: string; goal: string; tone: string; format: string
  offerType: string; ctaStrategy: string; creativeDirection: string; confidence: Record<string, number>; requiresConfirmation: string[]
}
type Props = { workspace: LaunchpadWorkspace; busy?: boolean; onApprove: (value: LaunchpadApprovalPackage) => Promise<void> | void }

const directions: Record<LaunchpadWorkspace, SuggestionCard[]> = {
  business: [
    { id: 'authority', title: uiText('generatedUi.u_3f5a006d7dae44cd'), description: uiText('generatedUi.u_bccc1a2a5f4a50a4'), metadata: ['Trust', 'Value', 'Growth'] },
    { id: 'demonstration', title: uiText('generatedUi.u_ab4f20e76db351ca'), description: uiText('generatedUi.u_a751e7194c3a6c14'), metadata: ['Proof', 'Workflow', 'CTA'] },
    { id: 'local', title: uiText('generatedUi.u_becacc45ac113b7c'), description: uiText('generatedUi.u_b02380999af7f455'), metadata: ['Local', 'Community', 'Conversion'] },
  ],
  creator: [
    { id: 'education', title: uiText('generatedUi.u_85962aff21bdc422'), description: uiText('generatedUi.u_05031db1eb6dbc1f'), metadata: ['Education', 'Authority', 'Audience'] },
    { id: 'story', title: uiText('generatedUi.u_6a683e9afca2e0ab'), description: uiText('generatedUi.u_6b597a7f11dd8c01'), metadata: ['Story', 'Identity', 'Community'] },
    { id: 'demonstration', title: uiText('generatedUi.u_6149c4fa5cba5823'), description: uiText('generatedUi.u_29ce79d7ab9c9976'), metadata: ['Process', 'Proof', 'Follow'] },
  ],
  podcast: [
    { id: 'expert', title: uiText('generatedUi.u_9db0aa46b8943a6b'), description: uiText('generatedUi.u_f88ce9b1ada6df8f'), metadata: ['Expert', 'Interview', 'Authority'] },
    { id: 'education', title: uiText('generatedUi.u_33070f65d4657bc4'), description: uiText('generatedUi.u_456996e9c4525009'), metadata: ['Learning', 'Series', 'Retention'] },
    { id: 'story', title: uiText('generatedUi.u_33b2706521741d5e'), description: uiText('generatedUi.u_97cf99dc0ae3e05c'), metadata: ['Story', 'Emotion', 'Episodes'] },
  ],
  store: [
    { id: 'proof', title: uiText('generatedUi.u_04591b65f5a9e1d6'), description: uiText('generatedUi.u_2f542087e510ddff'), metadata: ['Product', 'Proof', 'Conversion'] },
    { id: 'lifestyle', title: uiText('generatedUi.u_414bf58221c19412'), description: uiText('generatedUi.u_f2d78639d1862197'), metadata: ['Lifestyle', 'Identity', 'Desire'] },
    { id: 'offer', title: uiText('generatedUi.u_218943ebba0be9a4'), description: uiText('generatedUi.u_006a135af70772b4'), metadata: ['Offer', 'Urgency', 'CTA'] },
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
    } catch (value) { setData(null); setError(value instanceof Error ? value.message : "URL analysis failed.") }
    finally { setAnalyzing(false) }
  }

  async function approve() {
    if (!data || !selected || !ready) return setError("Analyze the source and review every required launch option before approval.")
    const audienceConfidence = data.detected.audiences.length ? Math.min(...data.detected.audiences.map((item) => item.confidence)) : 0
    setError('')
    await onApprove({ workspace, sourceUrl: data.finalUrl || data.sourceUrl, organization: data.organization || data.title || '', description: data.description || '', industry, audiences, region, language, goal, tone, format, offerType, ctaStrategy, creativeDirection: selected.title, confidence: { industry: data.detected.industry.confidence, audience: audienceConfidence, region: data.detected.region.confidence, goal: data.detected.goal.confidence }, requiresConfirmation: data.requiresConfirmation })
  }

  return <section className="sb-glass-panel" style={{ padding: 20, display: 'grid', gap: 14 }} aria-labelledby={`${workspace}-profile`}>
    <h2 id={`${workspace}-profile`} style={{ margin: 0, fontSize: 18 }}><LocalizedText fallback={uiText('generatedUi.u_172042134f3057a6')} /></h2>
    <SourceUrlField label={uiText('generatedUi.u_3024d9fd1e6be7fd')} helperText={uiText('generatedUi.u_fffa6aed09491b5d')} value={sourceUrl} onChange={(value) => { setSourceUrl(value); setData(null) }} required />
    <div><button type="button" className="sb-button-secondary" onClick={analyze} disabled={busy || analyzing || Boolean(validateSourceUrl(sourceUrl))}>{analyzing ? uiText('generatedUi.u_2bfac71b180af5fa') : uiText('generatedUi.u_8db4b7da61625c04')}</button></div>
    {data && <div role="status" aria-live="polite" style={{ border: '1px solid rgba(26,240,255,.25)', borderRadius: 14, padding: 14, background: 'rgba(26,240,255,.06)' }}>
      <strong style={{ color: '#1af0ff' }}><LocalizedText fallback={uiText('generatedUi.u_fec93c6c552ee1e9')} /></strong><h3 style={{ margin: '8px 0 4px' }}>{data.organization || data.title || uiText('generatedUi.u_813e2ce4e93d6d09')}</h3>
      <p style={{ margin: 0, color: 'rgba(255,255,255,.68)' }}>{data.description || uiText('generatedUi.u_8c309d37bb504f57')}</p>
      <p style={{ margin: '10px 0 0', fontSize: 12 }}>{uiText('generatedUi.u_b44484a0fa28c471')}{data.detected.industry.confidence}{uiText('generatedUi.u_2eaee058731fc293')}{data.detected.region.confidence}{uiText('generatedUi.u_68c2b74655da1538')}{schemaLanguage(data.metadata.language)}</p>
      {data.requiresConfirmation.length > 0 && <p style={{ color: '#ffc300', margin: '8px 0 0', fontSize: 12 }}>{uiText('generatedUi.u_32644c86d8172bde')}{data.requiresConfirmation.join(', ')}.</p>}
    </div>}
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
      <SearchableSelect label={uiText('generatedUi.u_b44484a0fa28c471')} options={enterpriseOptions.industries} value={industry} onChange={setIndustry} required />
      <SearchableMultiSelect label={uiText('generatedUi.u_545c02357695a6ff')} options={enterpriseOptions.audiences} values={audiences} onChange={setAudiences} />
      <SearchableSelect label={uiText('generatedUi.u_d3a008ef1335692d')} options={enterpriseOptions.regions} value={region} onChange={setRegion} required />
      <SearchableSelect label={uiText('generatedUi.u_a4fe65264ef7dbb3')} options={enterpriseOptions.languages} value={language} onChange={setLanguage} required />
      <SearchableSelect label={uiText('generatedUi.u_cdbf6975e8a35b0d')} options={enterpriseOptions.goals} value={goal} onChange={setGoal} required />
      <SearchableSelect label={uiText('generatedUi.u_c2c8b72e302ec730')} options={enterpriseOptions.tones} value={tone} onChange={setTone} required />
      <SearchableSelect label={uiText('generatedUi.u_2f343666aaa88c44')} options={enterpriseOptions.formats} value={format} onChange={setFormat} required />
      <SearchableSelect label={uiText('generatedUi.u_2a8e278e97755982')} options={enterpriseOptions.offer_types} value={offerType} onChange={setOfferType} required />
      <SearchableSelect label={uiText('generatedUi.u_0b28778c262112ff')} options={enterpriseOptions.cta_strategies} value={ctaStrategy} onChange={setCtaStrategy} required />
    </div>
    <SuggestionCardGrid label={uiText('generatedUi.u_fe57781bc0cdf5ee')} suggestions={cards} selectedId={direction} onSelect={setDirection} />
    {error && <p role="alert" style={{ margin: 0, color: '#fca5a5' }}>{error}</p>}
    <div style={{ display: 'flex', justifyContent: 'flex-end' }}><button type="button" className="sb-button-primary" onClick={approve} disabled={busy || analyzing || !ready}>{busy ? uiText('generatedUi.u_c74cd426edba8d4f') : uiText('generatedUi.u_5c55941d88afc361')}</button></div>
  </section>
}
