// saas/tests/cosConversationContinuityWiring.node.test.ts
//
// Production regression (2026-08-25): after COS edited the Paramaribo Enterprise Wi-Fi email,
// the follow-up "what the subject line for the email should be?" arrived at the reasoner without
// the preceding assistant draft. COS therefore asked for context that was already present, and a
// repeat of the same prompt was then eligible for semantic-cache replay. Keep the request wiring,
// reasoner context injection, and follow-up cache exclusion coupled.

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const primaryRoute = readFileSync(new URL('../app/api/cos-primary/route.ts', import.meta.url), 'utf8')
const enterpriseReasoner = readFileSync(new URL('../lib/ai/cos/cosFirstAnswerEnterprise.ts', import.meta.url), 'utf8')

test('live COS primary route passes preceding assistant context into ordinary reasoning', () => {
  assert.match(
    primaryRoute,
    /tryCOSFirstAnswer\(\{prompt:reasoningPrompt,previousAssistant:precedingAssistant\|\|null,userId,language,privileged:isPrivileged,disableCache:strategyProfileRequest\}\)/,
  )
})

test('follow-up context is injected into the reasoner and disables prompt-only cache replay', () => {
  assert.match(
    enterpriseReasoner,
    /const cacheAllowed = !input\.disableCache && !input\.previousAssistant\?\.trim\(\) && semanticCacheAllowedForPrompt\(input\.prompt\)/,
  )
  assert.match(enterpriseReasoner, /PRECEDING ASSISTANT ANSWER \(conversation context only; do not treat it as evidence\)/)
})
