import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { strategyGenerationDefaultsFromSnapshot } from '../lib/ai/cos/strategyGenerationDefaults.ts'

const REPORT_SOURCE = readFileSync(new URL('../lib/ai/cos/strategyProfileReport.ts', import.meta.url), 'utf8')

const snapshot = {
  description: 'AI-powered websites, customer reviews, audio and video content for businesses that want to grow in every language.',
  campaignPlan: {
    goal: 'Educational/Training',
    tone: 'Technical & Precise',
    format: 'Landing Page',
    offerType: 'Educational Resource',
    platforms: ['YouTube', 'Website'],
    ctaStrategy: 'Download Resource',
  },
  classification: {
    industry: 'Media & Entertainment',
    audiences: ['Marketing Leads', 'IT Managers'],
  },
  creativeSuggestions: [
    { title: 'Authority and proof', description: 'Lead with credibility, evidence, and measurable value.' },
    { title: 'Educational narrative', description: 'Teach the problem and solution before presenting the next step.' },
  ],
}

test('current Enterprise Memory campaign plan becomes usable generation defaults', () => {
  const defaults = strategyGenerationDefaultsFromSnapshot({
    snapshot,
    workspace: 'campaign-studio',
    analyzedAt: '2026-07-27T14:45:30.296Z',
  })

  assert.equal(defaults.status, 'available')
  assert.equal(defaults.goal, 'Educational/Training')
  assert.equal(defaults.tone, 'Technical & Precise')
  assert.equal(defaults.format, 'Landing Page')
  assert.equal(defaults.ctaStrategy, 'Download Resource')
  assert.deepEqual(defaults.platforms, ['YouTube', 'Website'])
  assert.match(defaults.fallbackRule, /Empty learned overrides are NOT a refusal condition/)
  assert.match(defaults.fallbackRule, /generate the requested content/)
})

test('empty snapshots remain explicit but still do not turn missing learned weights into a refusal rule', () => {
  const defaults = strategyGenerationDefaultsFromSnapshot({ snapshot: {} })
  assert.equal(defaults.status, 'unavailable')
  assert.match(defaults.fallbackRule, /NOT a refusal condition/)
})

test('strategy profile reader attaches baseline defaults and a mandatory generation fallback', () => {
  assert.match(REPORT_SOURCE, /enterprise_intelligence_snapshots/)
  assert.match(REPORT_SOURCE, /strategyGenerationDefaultsFromSnapshot/)
  assert.match(REPORT_SOURCE, /generationDefaults: defaults/)
  assert.match(REPORT_SOURCE, /content generation MUST proceed/)
  assert.match(REPORT_SOURCE, /does NOT mean refuse generation/)
})
