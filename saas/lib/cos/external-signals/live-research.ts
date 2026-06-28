import { getExternalInfo } from '@/lib/ai/tools/getExternalInfo'
import { ingestExternalSignals } from './normalizer'
import type { ExternalSignalIngestionResult, ExternalSignalInput } from './types'

function confidenceFromRank(index: number) {
  return Math.max(52, 68 - index * 3)
}

function signalFromResult(result: { title: string; url: string; snippet: string }, index: number, query: string): ExternalSignalInput {
  const text = `${result.title} ${result.snippet}`.toLowerCase()
  const format = text.includes('short') || text.includes('reel')
    ? 'niche_short_9x16'
    : text.includes('demo') || text.includes('tour')
      ? 'platform_tour_16x9'
      : undefined
  const hero = text.includes('presenter') || text.includes('spokesperson')
    ? 'talking_head_avatar'
    : text.includes('mascot')
      ? 'animated_mascot'
      : text.includes('dashboard') || text.includes('product')
        ? 'faceless_dashboard_tour'
        : undefined

  return {
    source_type: 'web_research',
    source_name: `live_research_${index + 1}`,
    source_url: result.url,
    audience: 'small business owners and operators',
    region: 'global',
    product: 'SignalBoost SaaS platform',
    observed_format: format,
    observed_hero: hero,
    confidence: confidenceFromRank(index),
    notes: [`query=${query}`, `title=${result.title}`, `snippet=${result.snippet}`],
  }
}

export async function ingestLiveResearchSignals(query = 'short product demo video small business SaaS presenter dashboard tour'): Promise<ExternalSignalIngestionResult & { query: string; source_error?: string }> {
  const result = await getExternalInfo(query)
  if (!result.ok || !result.results.length) {
    return { ...ingestExternalSignals([]), query, source_error: result.error || 'No live research results returned.' }
  }
  return { ...ingestExternalSignals(result.results.map((item, index) => signalFromResult(item, index, query))), query }
}
