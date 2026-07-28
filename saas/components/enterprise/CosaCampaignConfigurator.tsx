'use client'

import { LocalizedText } from '@/components/i18n/LocalizedText'

import { useMemo, useState, type FormEvent } from 'react'
import { SearchableMultiSelect, SearchableSelect, SourceUrlField, SuggestionCardGrid, validateSourceUrl, type SuggestionCard } from '@/components/enterprise'
import { enterpriseOptions } from '@/lib/enterprise/masterConfig'
import { buildCampaignDirective, isCampaignBriefComplete, type StructuredCampaignBrief } from '@/lib/enterprise/campaignBrief'
import type { UrlIntelligenceResult } from '@/lib/enterprise/url-intelligence/types'
import { uiCopy } from '@/lib/i18n/generatedUiCopy'


type Props = { busy?: boolean; onSubmit: (directive: string) => Promise<void> | void }

const concepts: SuggestionCard[] = [
  { id: 'authority', title: uiCopy('u_92803d4d9763b63f'), description: uiCopy('u_1e3c7ab840b7ee7c'), metadata: ['Trust', 'ROI', 'Decision makers'] },
  { id: 'demonstration', title: uiCopy('u_448353daedaffcf0'), description: uiCopy('u_acb3ca3b05eac796'), metadata: ['Demo', 'Proof', 'CTA'] },
  { id: 'education', title: uiCopy('u_eaa5bf58fa27de6b'), description: uiCopy('u_676e6c2217554478'), metadata: ['Training', 'Clarity', 'Value'] },
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
      setError(value instanceof Error ? value.message : uiCopy('u_1c600068ef75dc31'))
    } finally {
      setAnalyzing(false)
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!intelligence) { setError(uiCopy('u_e078979317e94a49')); return }
    if (!ready) { setError(uiCopy('u_773cc566837b62c9')); return }
    setError('')
    await onSubmit(`${buildCampaignDirective(brief)} Primary distribution platform: ${platform}. Source analysis title: ${intelligence.title}. Source analysis description: ${intelligence.description}.`)
  }

  return <form onSubmit={submit} style={{ display: 'grid', gap: 14, marginTop: 16 }}>
    <SourceUrlField label={uiCopy('u_30c1eb9281f3938c')} value={sourceUrl} onChange={(value) => { setSourceUrl(value); setIntelligence(null) }} required helperText={uiCopy('u_f4a7c9a9c326c4a6')} />
    <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
      <button type="button" onClick={analyzeSource} disabled={busy || analyzing || Boolean(validateSourceUrl(sourceUrl))} style={{ border: '1px solid rgba(26,240,255,.35)', background: 'rgba(26,240,255,.1)', color: '#1af0ff', borderRadius: 12, padding: '10px 14px', fontWeight: 900, cursor: analyzing ? 'wait' : 'pointer', opacity: busy || analyzing || Boolean(validateSourceUrl(sourceUrl)) ? .55 : 1 }}>{analyzing ? uiCopy('u_54c5fa31a0786643') : uiCopy('u_3b2cd194aca68154')}</button>
    </div>
    {intelligence && <section style={{ border: '1px solid rgba(26,240,255,.25)', borderRadius: 14, background: 'rgba(26,240,255,.06)', padding: 14 }}>
      <p style={{ margin: 0, color: '#1af0ff', fontSize: 12, fontWeight: 900 }}>{uiCopy('u_b29da38d6d0472a6')}{intelligence.sourceType}</p>
      <h3 style={{ color: '#fff', margin: '8px 0 4px', fontSize: 16 }}>{intelligence.title || intelligence.organization || uiCopy('u_fa9b71d9d703f680')}</h3>
      <p style={{ color: 'rgba(255,255,255,.68)', margin: 0, lineHeight: 1.5 }}>{intelligence.description || uiCopy('u_aeeae564e2d7fd0b')}</p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
        <span style={{ color: '#fff', fontSize: 11 }}>{uiCopy('u_ecafe4afda6cf262')}{intelligence.detected.goal.confidence}%</span>
        <span style={{ color: '#fff', fontSize: 11 }}>{uiCopy('u_cda1c0d2bf4928b0')}{intelligence.detected.tone.confidence}%</span>
        <span style={{ color: '#fff', fontSize: 11 }}>{uiCopy('u_aa27ca366c314152')}{intelligence.detected.region.confidence}%</span>
        <span style={{ color: '#fff', fontSize: 11 }}>{uiCopy('u_05fc905b5b4e7878')}{intelligence.detected.format.confidence}%</span>
      </div>
      {intelligence.requiresConfirmation.length > 0 && <p style={{ color: '#ffc300', margin: '10px 0 0', fontSize: 12 }}>{uiCopy('u_ce2da3854e03305c')}{intelligence.requiresConfirmation.join(', ')}{uiCopy('u_a9bff2069050ae5b')}</p>}
    </section>}
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
      <SearchableSelect label={uiCopy('u_1825b2eaac7c8fde')} options={enterpriseOptions.goals} value={goal} onChange={setGoal} required />
      <SearchableMultiSelect label={uiCopy('u_0bee610c86a00c11')} options={enterpriseOptions.audiences} values={audiences} onChange={setAudiences} />
      <SearchableSelect label={uiCopy('u_356275f43eaa8525')} options={enterpriseOptions.tones} value={tone} onChange={setTone} required />
      <SearchableSelect label={uiCopy('u_1ae843ad99b4dd0c')} options={enterpriseOptions.regions} value={region} onChange={setRegion} required />
      <SearchableSelect label={uiCopy('u_2fb4a257031e547e')} options={supportedPlatforms} value={platform} onChange={setPlatform} required />
      <SearchableSelect label={uiCopy('u_1218163a8c72dd4d')} options={enterpriseOptions.formats} value={format} onChange={setFormat} required />
      <SearchableSelect label={uiCopy('u_1e9acd798baed463')} options={enterpriseOptions.offer_types} value={offerType} onChange={setOfferType} required />
      <SearchableSelect label={uiCopy('u_5433bf89087a5451')} options={enterpriseOptions.cta_strategies} value={ctaStrategy} onChange={setCtaStrategy} required />
    </div>
    <p style={{ margin: 0, color: 'rgba(255,255,255,.55)', fontSize: 11 }}><LocalizedText fallback={uiCopy('u_87af4e339866f072')} /></p>
    <SuggestionCardGrid label={uiCopy('u_4900fa9f25cf023c')} suggestions={concepts} selectedId={concept} onSelect={setConcept} />
    {error && <p style={{ color: '#fca5a5', margin: 0 }}>{error}</p>}
    <div style={{ display: 'flex', justifyContent: 'flex-end' }}><button disabled={busy || analyzing || !ready} style={{ border: 'none', background: '#ffc300', color: '#000', borderRadius: 12, padding: '10px 14px', fontWeight: 900, cursor: busy || analyzing ? 'wait' : 'pointer', opacity: busy || analyzing || !ready ? .55 : 1 }}>{busy ? uiCopy('u_b1fa05840ecfa413') : uiCopy('u_ce1a119821c5a7d5')}</button></div>
  </form>
}
