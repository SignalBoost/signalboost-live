// saas/tests/cosEvidenceNarrationHygiene.node.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { stripInternalEvidenceIds } from '../lib/ai/cos/answerEvidenceIdHygiene.ts'

const PRODUCTION = `Kubernetes ensures reliability through a combination of automated scheduling, self-healing, and traffic management.

Probes are the critical mechanisms:
Readiness Probes: If a readiness probe fails, Kubernetes removes the pod's IP from any associated Services.

The selected learned corpus ([CL1]–[CL6]) discusses microservice dynamics, autoscaling algorithms, network-aware scheduling, and emergent failures in cloud environments. However, it does not provide specific details on Kubernetes' native health-checking mechanisms (probes) or its node-failure recovery logic. Therefore, I have answered based on standard Kubernetes operational principles rather than the provided learning material.`

test('a paragraph narrating the evidence block is removed from the answer, with its continuation', () => {
  // Production 2026-09-30 03:19 UTC, replayed from the semantic cache: the reader was told what the "selected
  // learned corpus (–)" covered and that the answer came from "standard principles rather than the provided learning material".
  const cleaned = stripInternalEvidenceIds(PRODUCTION)
  assert.doesNotMatch(cleaned, /learned corpus|learning material|does not provide specific details|\(\s*[–-]\s*\)/i)
  assert.match(cleaned, /Readiness Probes: If a readiness probe fails/)
  assert.ok(cleaned.endsWith('associated Services.'))
})

test('ordinary uses of "learning material" are untouched', () => {
  const text = 'Create learning material for new hires. This learning material covers onboarding and payroll.'
  assert.equal(stripInternalEvidenceIds(text), text)
})

test('the answer prompt no longer tells the model to announce unused learned evidence', () => {
  const source = readFileSync(new URL('../lib/ai/cos/cosFirstAnswerEnterprise.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /explicitly say the selected learned material does not answer the question/)
  assert.doesNotMatch(source, /or state that it does not answer the question; never silently ignore it/)
  assert.match(source, /If none supports the answer, answer without them and do not mention them/)
  assert.match(source, /never tell the reader that supplied, selected, learned or corpus material was or was not relevant/)
  // Cache replays pass through the same cleaner, so answers already cached with this paragraph are cleaned too.
  assert.match(source, /reply:cleanAnswerText\(cached\.reply\)/)
  assert.match(source, /reply:cleanAnswerText\(payload\.reply\)/)
})
