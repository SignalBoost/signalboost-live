'use client'

import { LocalizedText } from '@/components/i18n/LocalizedText'

import { useMemo, useState, type FormEvent } from 'react'
import { SearchableMultiSelect, SearchableSelect, SourceUrlField, SuggestionCardGrid, validateSourceUrl, type SuggestionCard } from '@/components/enterprise'
import { enterpriseOptions } from '@/lib/enterprise/masterConfig'
import { buildCampaignDirective, isCampaignBriefComplete, type StructuredCampaignBrief } from '@/lib/enterprise/campaignBrief'
import type { UrlIntelligenceResult } from '@/lib/enterprise/url-intelligence/types'
import { uiText } from '@/lib/i18n/uiText'

type Props = { busy?: boolean; onSubmit: (directive: string) => Promise<void> | void }

const concepts: SuggestionCard[] = [
  { id: 'authority', title: uiText('generatedUi.u_51e716c2a48a766b'), description: uiText('generatedUi.u_7457215bf1064734'), metadata: ['Trust', 'ROI', 'Decision makers'] },
  { id: 'demonstration', title: uiText('generatedUi.u_75c419ef704f82fe'), description: uiText('generatedUi.u_988324fef9d35ba1'), metadata: ['Demo', 'Proof', 'CTA'] },
  { id: 'education', title: uiText('generatedUi.u_19b761b533fb818c'), description: uiText('generatedUi.u_d93a8bc97280279f'), metadata: ['Training', 'Clarity', 'Value'] },
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
      setError(value instanceof Error ? value.message : "URL analysis failed.")
    } finally {
      setAnalyzing(false)
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!intelligence) { setError("Analyze the source URL before building the campaign."); return }
    if (!ready) { setError("Review the analyzed source and complete every required campaign option."); return }
    setError('')
    await onSubmit(`${buildCampaignDirective(brief)} Primary distribution platform: ${platform}. Source analysis title: ${intelligence.title}. Source analysis description: ${intelligence.description}.`)
  }

  return <form onSubmit={submit} style={{ display: 'grid', gap: 14, marginTop: 16 }}>
    <SourceUrlField label={uiText('generatedUi.u_3024d9fd1e6be7fd')} value={sourceUrl} onChange={(value) => { setSourceUrl(value); setIntelligence(null) }} required helperText={uiText('generatedUi.u_3a59c0df4f617b9a')} />
    <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
      <button type="button" onClick={analyzeSource} disabled={busy || analyzing || Boolean(validateSourceUrl(sourceUrl))} style={{ border: '1px solid rgba(26,240,255,.35)', background: 'rgba(26,240,255,.1)', color: '#1af0ff', borderRadius: 12, padding: '10px 14px', fontWeight: 900, cursor: analyzing ? 'wait' : 'pointer', opacity: busy || analyzing || Boolean(validateSourceUrl(sourceUrl)) ? .55 : 1 }}>{analyzing ? uiText('generatedUi.u_2bfac71b180af5fa') : uiText('generatedUi.u_8db4b7da61625c04')}</button>
    </div>
    {intelligence && <section style={{ border: '1px solid rgba(26,240,255,.25)', borderRadius: 14, background: 'rgba(26,240,255,.06)', padding: 14 }}>
      <p style={{ margin: 0, color: '#1af0ff', fontSize: 12, fontWeight: 900 }}>{uiText('generatedUi.u_2ba46efce3f1c658')}{intelligence.sourceType}</p>
      <h3 style={{ color: '#fff', margin: '8px 0 4px', fontSize: 16 }}>{intelligence.title || intelligence.organization || uiText('generatedUi.u_b15d4e7cbfbc6316')}</h3>
      <p style={{ color: 'rgba(255,255,255,.68)', margin: 0, lineHeight: 1.5 }}>{intelligence.description || uiText('generatedUi.u_f4b0fe973ed3a0e7')}</p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
        <span style={{ color: '#fff', fontSize: 11 }}>{uiText('generatedUi.u_cdbf6975e8a35b0d')}{intelligence.detected.goal.confidence}%</span>
        <span style={{ color: '#fff', fontSize: 11 }}>{uiText('generatedUi.u_c2c8b72e302ec730')}{intelligence.detected.tone.confidence}%</span>
        <span style={{ color: '#fff', fontSize: 11 }}>{uiText('generatedUi.u_d3a008ef1335692d')}{intelligence.detected.region.confidence}%</span>
        <span style={{ color: '#fff', fontSize: 11 }}>{uiText('generatedUi.u_2f343666aaa88c44')}{intelligence.detected.format.confidence}%</span>
      </div>
      {intelligence.requiresConfirmation.length > 0 && <p style={{ color: '#ffc300', margin: '10px 0 0', fontSize: 12 }}>{uiText('generatedUi.u_32644c86d8172bde')}{intelligence.requiresConfirmation.join(', ')}{uiText('generatedUi.u_e28cd7b6575727f1')}</p>}
    </section>}
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
      <SearchableSelect label={uiText('generatedUi.u_cdbf6975e8a35b0d')} options={enterpriseOptions.goals} value={goal} onChange={setGoal} required />
      <SearchableMultiSelect label={uiText('generatedUi.u_545c02357695a6ff')} options={enterpriseOptions.audiences} values={audiences} onChange={setAudiences} />
      <SearchableSelect label={uiText('generatedUi.u_c2c8b72e302ec730')} options={enterpriseOptions.tones} value={tone} onChange={setTone} required />
      <SearchableSelect label={uiText('generatedUi.u_d3a008ef1335692d')} options={enterpriseOptions.regions} value={region} onChange={setRegion} required />
      <SearchableSelect label={uiText('generatedUi.u_c78ffe19571018fb')} options={supportedPlatforms} value={platform} onChange={setPlatform} required />
      <SearchableSelect label={uiText('generatedUi.u_2f343666aaa88c44')} options={enterpriseOptions.formats} value={format} onChange={setFormat} required />
      <SearchableSelect label={uiText('generatedUi.u_2a8e278e97755982')} options={enterpriseOptions.offer_types} value={offerType} onChange={setOfferType} required />
      <SearchableSelect label={uiText('generatedUi.u_0b28778c262112ff')} options={enterpriseOptions.cta_strategies} value={ctaStrategy} onChange={setCtaStrategy} required />
    </div>
    <p style={{ margin: 0, color: 'rgba(255,255,255,.55)', fontSize: 11 }}><LocalizedText fallback={uiText('generatedUi.u_d888c3cc027116d5')} /></p>
    <SuggestionCardGrid label={uiText('generatedUi.u_955fe28d6fc25bcd')} suggestions={concepts} selectedId={concept} onSelect={setConcept} />
    {error && <p style={{ color: '#fca5a5', margin: 0 }}>{error}</p>}
    <div style={{ display: 'flex', justifyContent: 'flex-end' }}><button disabled={busy || analyzing || !ready} style={{ border: 'none', background: '#ffc300', color: '#000', borderRadius: 12, padding: '10px 14px', fontWeight: 900, cursor: busy || analyzing ? 'wait' : 'pointer', opacity: busy || analyzing || !ready ? .55 : 1 }}>{busy ? uiText('generatedUi.u_5968f960f77a58a8') : uiText('generatedUi.u_4189932d0b20e615')}</button></div>
  </form>
}
