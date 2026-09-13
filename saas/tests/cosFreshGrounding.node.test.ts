// Runs the mature fresh-grounding regression suite plus targeted regressions for evaluative sports
// research and provider-independent Concierge/COS ingress.
import './cosFreshGroundingBase.node.test.ts'

import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { requiresFreshExternalEvidence } from '../lib/ai/cos/cosFreshnessPolicy.ts'
import {
  freshEvidenceGroundingBlock,
  freshEvidenceMeetsAuthority,
  freshEvidenceSearchQueries,
  isPersonOrOfficeEvaluation,
  isSportsTeamEvaluation,
  prepareFreshEvidence,
} from '../lib/ai/cos/cosFreshGrounding.ts'

test('best football team question uses sports evidence instead of unemployment CPI GDP', () => {
  const prompt = 'What is the best football team in Brazil?'
  const queries = freshEvidenceSearchQueries(prompt, new Date('2026-09-13T00:00:00.000Z'))
  const joined = queries.join('\n')

  assert.equal(isSportsTeamEvaluation(prompt), true)
  assert.equal(isPersonOrOfficeEvaluation(prompt), false)
  assert.ok(queries.length >= 3, 'evaluative sports research must gather multiple evidence dimensions')
  assert.match(joined, /league champions|championship titles|standings/i)
  assert.match(joined, /continental|international/i)
  assert.doesNotMatch(joined, /unemployment|\bCPI\b|\bGDP\b/i)
})

test('Portuguese evaluative sports lookup enters live verification before local synthesis', () => {
  for (const prompt of [
    'qual e a melhor selecao de futebol do mundo?',
    'qual é a melhor seleção de futebol do mundo?',
    'qual e o melhor time de futebol do brasil?',
  ]) {
    assert.equal(requiresFreshExternalEvidence(prompt), true, prompt)
    assert.equal(isSportsTeamEvaluation(prompt), true, prompt)
    const queries = freshEvidenceSearchQueries(prompt, new Date('2026-09-13T00:00:00.000Z'))
    assert.ok(queries.length >= 3, `${prompt} must produce bounded comparative sports research`)
  }
})

test('office-holder evaluation keeps the existing economic comparison research plan', () => {
  const prompt = 'Who was the worst US president?'
  const joined = freshEvidenceSearchQueries(prompt).join('\n')

  assert.equal(isPersonOrOfficeEvaluation(prompt), true)
  assert.equal(isSportsTeamEvaluation(prompt), false)
  assert.match(joined, /unemployment/i)
  assert.match(joined, /CPI|inflation/i)
  assert.match(joined, /GDP/i)
})

test('evaluative sports synthesis compares criteria instead of abstaining for lack of one universal winner', () => {
  const prompt = 'What is the best football team in Brazil?'
  const sources = prepareFreshEvidence([
    { title: 'Domestic championship history', url: 'https://league.example/champions', snippet: 'Official championship winners and title history.' },
    { title: 'Continental competition history', url: 'https://continental.example/history', snippet: 'Official continental title history by club.' },
    { title: 'Current league table', url: 'https://standings.example/table', snippet: 'Current season standings.' },
  ])

  assert.equal(freshEvidenceMeetsAuthority(prompt, sources), true)
  const block = freshEvidenceGroundingBlock(prompt, sources, '2026-09-13T12:00:00.000Z')
  assert.match(block, /EVALUATIVE SPORTS COMPARISON RULES/)
  assert.match(block, /criteria-dependent/i)
  assert.match(block, /recent domestic performance/i)
  assert.match(block, /continental\/international success/i)
  assert.match(block, /Do not refuse merely because different sources emphasize different clubs or eras/i)
})

test('COS status depends on the independent reasoner, not ANTHROPIC_API_KEY', () => {
  const source = readFileSync(new URL('../app/api/cos/status/route.ts', import.meta.url), 'utf8')
  assert.match(source, /independentReasonerHealth/)
  assert.match(source, /externalFallbackEnabled/)
  assert.match(source, /providerIndependent/)
  assert.doesNotMatch(source, /ANTHROPIC_API_KEY/)

  const publicGate = source.indexOf('if (!isOwner)')
  const healthProbe = source.indexOf('await independentReasonerHealth()')
  assert.ok(publicGate >= 0 && healthProbe > publicGate, 'private reasoner diagnostics must be probed only after the owner gate')
})

test('legacy browser network ingresses cannot bypass provenance or provider-independent COS routing', () => {
  const proxy = readFileSync(new URL('../proxy.ts', import.meta.url), 'utf8')
  const provenanceRoute = readFileSync(new URL('../app/api/cos-provenance-browser/route.ts', import.meta.url), 'utf8')
  const aiRoute = readFileSync(new URL('../app/api/ai/route.ts', import.meta.url), 'utf8')
  assert.match(proxy, /pathname === '\/api\/support'/)
  assert.match(proxy, /target\.pathname = '\/api\/cos-provenance-browser'/)
  assert.match(proxy, /baseProxy\(req\)/, 'anonymous spend gate must still run before the provenance rewrite')
  assert.match(provenanceRoute, /POST as cosBrowserPost/)
  assert.match(provenanceRoute, /ensureAnswerExecutionProvenance/)
  assert.match(aiRoute, /POST as cosBrowserPost/)
  assert.doesNotMatch(aiRoute, /supportPost/)
})

test('hosted fallback remains exact opt-in rather than key-presence driven', () => {
  const source = readFileSync(new URL('../lib/ai/cos/cosOrchestrationEnterprise.ts', import.meta.url), 'utf8')
  assert.match(source, /COS_EXTERNAL_AI_FALLBACK_ENABLED\s*===\s*'true'/)
})
