// saas/tests/cosStrategyProfileRequest.node.test.ts
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { isStrategyProfileRequest, strategyProfileEvidenceBlock, type StrategyProfileEvidenceView } from '../lib/ai/cos/strategyProfileRequest.ts'
import type { StrategyProfile } from '../lib/ai/cos/strategyProfile.ts'

const RETRIEVER_PATH = readFileSync(new URL('../lib/enterprise/memory/retriever.ts', import.meta.url), 'utf8')

function profile(overrides: Partial<StrategyProfile> = {}): StrategyProfile {
  return {
    generatedAt: '2026-08-23T02:00:00.000Z',
    totalCampaigns: 20,
    measuredCampaigns: 14,
    unmeasuredCampaigns: 6,
    changesBehavior: true,
    summary: '1 of 3 dimensions learned from 14 measured campaigns: cta → "Book a demo".',
    dimensions: [
      {
        dimension: 'cta',
        status: 'learned',
        recommended: 'Book a demo',
        reason: 'Book a demo beat Learn more across 14 measured campaigns.',
        relativeMargin: 0.42,
        variants: [
          { variant: 'Book a demo', measuredCampaigns: 8, impressions: 12000, clicks: 480, revenue: 0, cost: 0, clickThroughRate: 0.04, averagePerformanceScore: 0.71, campaignIds: [] },
          { variant: 'Learn more', measuredCampaigns: 6, impressions: 9000, clicks: 253, revenue: 0, cost: 0, clickThroughRate: 0.028, averagePerformanceScore: 0.5, campaignIds: [] },
        ],
      },
      { dimension: 'channel', status: 'insufficient_evidence', recommended: null, reason: 'Only 2 measured campaigns per channel.', relativeMargin: null, variants: [] },
      { dimension: 'creative', status: 'no_clear_winner', recommended: null, reason: 'Variants are within noise of each other.', relativeMargin: null, variants: [] },
    ],
    rework: {
      status: 'learned',
      approvedCampaigns: 12,
      campaignsRequiringEdits: 3,
      reworkRate: 0.25,
      reason: '3 of 12 approved campaigns required edits.',
    },
    ...overrides,
  }
}

function baselineView(overrides: Partial<StrategyProfile> = {}): StrategyProfileEvidenceView {
  return {
    ...profile(overrides),
    generationDefaults: {
      status: 'available',
      source: 'enterprise_intelligence_snapshot',
      workspace: 'signalboost',
      analyzedAt: '2026-08-22T20:00:00.000Z',
      description: 'AI-powered websites and reviews for businesses.',
      goal: 'Educational/Training',
      tone: 'Technical & Precise',
      format: 'Landing Page',
      offerType: 'Download Resource',
      platforms: ['LinkedIn'],
      ctaStrategy: 'Download',
      audiences: ['Business owners'],
      industry: 'Media & Entertainment',
      creativeSuggestions: [],
      fallbackRule: 'Apply learned strategy overrides only where the measured profile has status learned. For every other dimension, keep these baseline defaults. Empty learned overrides are NOT a refusal condition: generate the requested content using these defaults and then explain that measured outcomes did not change them.',
    },
    generationRule: 'Overlay learned dimensions on generationDefaults. If no learned override exists, generationDefaults remain active and content generation MUST proceed; lack of measured weights is not a reason to refuse.',
  }
}

test('the verbatim production request is recognized', () => {
  assert.equal(isStrategyProfileRequest('Generate content using the current strategy profile weights and explain which heuristics influenced the output.'), true)
})

test('retrieval terms preserve enough intent for the Enterprise Memory boundary', () => {
  assert.equal(isStrategyProfileRequest('generate content current strategy profile weights explain heuristics influenced output'), true)
})

test('use-it and explain-it phrasings are recognized across languages', () => {
  for (const prompt of [
    'write a landing page based on our learned performance profile',
    'which heuristics are influencing our content right now?',
    'genera contenido usando el perfil de estrategia actual',
    'gere conteúdo com base no perfil de estratégia',
    'wygeneruj treść na podstawie profilu strategii',
    'сгенерируй контент по текущему профилю стратегии',
  ]) assert.equal(isStrategyProfileRequest(prompt), true, prompt)
})

test('ordinary business talk about strategy does not trigger a profile read', () => {
  for (const prompt of [
    'our strategy is to expand into Europe next year',
    'what is a good content strategy for B2B SaaS?',
    'write a blog post about onboarding',
    'who is the current president of France?',
  ]) assert.equal(isStrategyProfileRequest(prompt), false, prompt)
})

test('Enterprise Memory strategy retrieval uses the canonical generation-view reader', () => {
  assert.match(RETRIEVER_PATH, /isStrategyProfileRequest\(\(args\.taskTags \|\| \[\]\)\.join\(' '\)\)/)
  assert.match(RETRIEVER_PATH, /import\('\.\.\/\.\.\/ai\/cos\/strategyProfileReport\.ts'\)/)
  assert.match(RETRIEVER_PATH, /strategyProfileEvidenceBlock\(profileResult\.profile\)/)
  assert.match(RETRIEVER_PATH, /enterprise_campaign_memory\+enterprise_intelligence_snapshots/)
  assert.doesNotMatch(RETRIEVER_PATH, /strategyProfileEvidenceBlock\(deriveStrategyProfile\(/)
  assert.match(RETRIEVER_PATH, /REQUESTED BUT UNAVAILABLE/)
  assert.match(RETRIEVER_PATH, /readLive: true/)
})

test('a learned profile renders recommendation evidence and keeps baseline for non-learned dimensions', () => {
  const block = strategyProfileEvidenceBlock(baselineView())
  assert.match(block, /DIMENSION CTA — status learned; recommended "Book a demo"/)
  assert.match(block, /Margin over runner-up: 42\.0%/)
  assert.match(block, /"Book a demo" — 8 measured campaigns; CTR 4\.0%/)
  assert.match(block, /"Learn more" — 6 measured campaigns; CTR 2\.8%/)
  assert.match(block, /BASELINE GENERATION DEFAULTS — ACTIVE/)
  assert.match(block, /Keep the corresponding baseline default when available/)
  assert.match(block, /Do NOT invent numeric weights/)
})

test('an unmeasurable variant is reported as such, never as a zero rate', () => {
  const sample = baselineView()
  sample.dimensions[0].variants[0].clickThroughRate = null
  assert.match(strategyProfileEvidenceBlock(sample), /CTR not measurable/)
})

test('zero measured campaigns still inject the current baseline and require generation', () => {
  const block = strategyProfileEvidenceBlock(baselineView({
    totalCampaigns: 0,
    measuredCampaigns: 0,
    unmeasuredCampaigns: 0,
    changesBehavior: false,
    summary: 'NO CHANGE RECOMMENDED — 0 measured campaigns.',
    dimensions: [
      { dimension: 'channel', status: 'insufficient_evidence', recommended: null, reason: 'No value reached 5 measured campaigns.', relativeMargin: null, variants: [] },
      { dimension: 'cta', status: 'insufficient_evidence', recommended: null, reason: 'No value reached 5 measured campaigns.', relativeMargin: null, variants: [] },
      { dimension: 'creative', status: 'insufficient_evidence', recommended: null, reason: 'No value reached 5 measured campaigns.', relativeMargin: null, variants: [] },
    ],
  }))

  assert.match(block, /Campaigns: 0 total, 0 measured/)
  assert.match(block, /Goal: Educational\/Training/)
  assert.match(block, /Tone: Technical & Precise/)
  assert.match(block, /Format: Landing Page/)
  assert.match(block, /Offer type: Download Resource/)
  assert.match(block, /CTA strategy: Download/)
  assert.match(block, /Write the content first using the BASELINE GENERATION DEFAULTS above unchanged/)
  assert.match(block, /Never answer this request only with an insufficient-data explanation/)
})
