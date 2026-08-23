import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { deriveStrategyProfile } from '../lib/ai/cos/strategyProfile.ts'
import {
  isDirectStrategyGenerationRequest,
  renderDirectStrategyGeneration,
} from '../lib/ai/cos/strategyProfileDirectGeneration.ts'
import type { StrategyGenerationDefaults } from '../lib/ai/cos/strategyGenerationDefaults.ts'

const SUPPORT_ROUTE = readFileSync(new URL('../app/api/support/route.ts', import.meta.url), 'utf8')

const defaults: StrategyGenerationDefaults = {
  status: 'available',
  source: 'enterprise_intelligence_snapshot',
  workspace: 'campaign-studio',
  analyzedAt: '2026-07-27T14:45:30.296Z',
  description: 'AI-powered websites, customer reviews, audio and video content for businesses that want to grow in every language.',
  goal: 'Educational/Training',
  tone: 'Technical & Precise',
  format: 'Landing Page',
  offerType: 'Educational Resource',
  platforms: ['YouTube', 'Website'],
  ctaStrategy: 'Download Resource',
  audiences: ['Marketing Leads', 'IT Managers'],
  industry: 'Media & Entertainment',
  creativeSuggestions: ['Authority and proof — Lead with credibility, evidence, and measurable value.'],
  fallbackRule: 'Keep the baseline when no learned override exists.',
}

const emptyProfile = {
  ...deriveStrategyProfile([], { now: new Date('2026-08-23T03:30:00Z') }),
  generationDefaults: defaults,
  generationRule: 'Overlay learned dimensions on generationDefaults.',
}

const exactPrompt = 'Generate content using the current strategy profile weights and explain which heuristics influenced the output.'

test('exact production prompt is recognized for the direct strategy fast path', () => {
  assert.equal(isDirectStrategyGenerationRequest(exactPrompt), true)
  assert.equal(isDirectStrategyGenerationRequest('Explain our strategy for Europe.'), false)
})

test('zero measured campaigns generates the actual baseline artifact before the explanation', () => {
  const reply = renderDirectStrategyGeneration(exactPrompt, emptyProfile)

  assert.ok(reply.indexOf('## Generated Content') >= 0)
  assert.ok(reply.indexOf('## Generated Content') < reply.indexOf('## Strategy Applied'))
  assert.match(reply, /AI-powered websites, customer reviews, audio and video content/i)
  assert.match(reply, /Educational\/Training/)
  assert.match(reply, /Technical & Precise/)
  assert.match(reply, /Landing Page/)
  assert.match(reply, /Educational Resource/)
  assert.match(reply, /YouTube, Website/)
  assert.match(reply, /Download Resource/)
  assert.match(reply, /Marketing Leads, IT Managers/)
  assert.match(reply, /No learned campaign heuristic overrode the baseline/i)
  assert.match(reply, /0 measured campaigns/i)
  assert.match(reply, /at least 5 measured campaigns/i)
  assert.match(reply, /at least 20%/i)
  assert.match(reply, /at least 8 approved campaigns/i)
  assert.match(reply, /does not store opaque numeric strategy weights/i)

  assert.doesNotMatch(reply, /Baseline Strategic Placeholder/i)
  assert.doesNotMatch(reply, /Launch Initial Pilot Campaigns/i)
  assert.doesNotMatch(reply, /COS_MEASURE_DELAY_HOURS/i)
  assert.doesNotMatch(reply, /continue this task/i)
})

test('an explicit topic is used instead of the organization fallback subject', () => {
  const reply = renderDirectStrategyGeneration(
    'Generate content about zero-trust API security using the current strategy profile weights and explain the heuristics.',
    emptyProfile,
  )
  assert.match(reply, /zero-trust API security/i)
  assert.match(reply, /topic supplied in the request was used as the content subject/i)
})

test('support route checks direct strategy generation before general model orchestration', () => {
  const direct = SUPPORT_ROUTE.indexOf('directStrategyProfileResponse(body, prompt, isPrivileged)')
  const general = SUPPORT_ROUTE.indexOf('withRunpodWakePermission(wakePermission, () => legacyPOST(req))')
  assert.ok(direct >= 0, 'direct strategy fast path must be wired into support route')
  assert.ok(general >= 0, 'general support orchestration must remain available for other requests')
  assert.ok(direct < general, 'strategy fast path must run before the expensive general model path')
  assert.match(SUPPORT_ROUTE, /source: 'cos-strategy-profile-direct'/)
  assert.match(SUPPORT_ROUTE, /execution_provenance: provenance/)
  assert.match(SUPPORT_ROUTE, /strategy_profile_generation/)
})
