import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { asksForExplicitPriorAnswerProvenance } from '../lib/ai/cos/explicitProvenanceIntent.ts'
import { regulatedOperationalScenarioDirective } from '../lib/ai/cos/regulatedOperationalScenarioIntent.ts'
import { scriptRequestDirective } from '../lib/ai/cos/scriptRequestIntent.ts'

const turnStore = readFileSync(new URL('../lib/ai/cos/turnExperienceStore.ts', import.meta.url), 'utf8')
const turnMigration = readFileSync(new URL('../supabase/migrations/20260822_cos_turn_confidence.sql', import.meta.url), 'utf8')
const feedbackRoute = readFileSync(new URL('../app/api/assistant/feedback/route.ts', import.meta.url), 'utf8')

const longProvenancePrompt = `shwo “Show me the complete provenance for the answer you just gave. Identify the primary model that generated the reasoning. List every COS internal system that materially contributed: semantic cache, Enterprise Memory, Knowledge Graph, learned corpus, autonomous research, local reasoning engine, and any external AI provider. For each one, state whether it was actually used, what evidence it contributed, and whether any new knowledge was retrieved or learned during this request. Do not list a component merely because it exists.”`

const regulatedIncidentPrompt = `If a global logistics company suffers a cyberattack that halts shipments in Asia but not in Europe, how should COS balance operational recovery with regulatory reporting across multiple jurisdictions?`

const regulatedHiringPrompt = `If COS is asked to optimize hiring workflows using AI, how should it reconcile efficiency gains with fairness, bias mitigation, and compliance with EU AI Act and US EEOC rules?`

test('long explicit prior-answer provenance requests bypass the short natural-language cap', () => {
  assert.ok(longProvenancePrompt.length > 300)
  assert.equal(asksForExplicitPriorAnswerProvenance(longProvenancePrompt), true)
})

test('long topical source requests are not mistaken for prior-answer provenance', () => {
  const topical = `Prepare a research plan about enterprise architecture. Include sources, references, citations, semantic cache design patterns, knowledge graphs, and external AI providers. ${'background '.repeat(80)}`
  assert.equal(asksForExplicitPriorAnswerProvenance(topical), false)
})

test('regulated cyber incident scenario gets a framework-level current-law guard', () => {
  const directive = regulatedOperationalScenarioDirective(regulatedIncidentPrompt)
  assert.ok(directive)
  assert.match(directive, /parallel recovery and compliance/i)
  assert.match(directive, /Do not assert a current statutory deadline/i)
  assert.match(directive, /require(?:s)? jurisdiction-specific verification/i)
  assert.match(directive, /Do not collapse the whole answer to a refusal/i)
  assert.match(scriptRequestDirective(regulatedIncidentPrompt) || '', /REGULATED INCIDENT MODE/)
})

test('regulated employment AI scenario blocks mutable law from model memory', () => {
  const directive = regulatedOperationalScenarioDirective(regulatedHiringPrompt)
  assert.ok(directive)
  assert.match(directive, /REGULATED EMPLOYMENT AI MODE/)
  assert.match(directive, /EU AI Act/i)
  assert.match(directive, /EEOC/i)
  assert.match(directive, /authoritative live evidence/i)
  assert.match(directive, /four-fifths\/80%/i)
  assert.match(directive, /not a successful optimization/i)
  assert.match(scriptRequestDirective(regulatedHiringPrompt) || '', /REGULATED EMPLOYMENT AI MODE/)
})

test('turn experience writer columns are backed by the checked-in production migration', () => {
  for (const column of ['confidence', 'confidence_threshold', 'draft_survived_unrepaired']) {
    assert.match(turnStore, new RegExp(`\\b${column}\\b`))
    assert.match(turnMigration, new RegExp(`add column if not exists ${column}\\b`))
  }
})

test('feedback still requires a server-owned turn correlation rather than trusting client text alone', () => {
  assert.match(feedbackRoute, /cos_turn_experience/)
  assert.match(feedbackRoute, /hashPrompt\(userPrompt\)/)
  assert.match(feedbackRoute, /Latest COS response has no turn correlation/)
})

test('fast feedback waits for deferred turn persistence without weakening verification', () => {
  assert.match(feedbackRoute, /TURN_CORRELATION_RETRY_DELAYS_MS\s*=\s*\[0,\s*80,\s*160,\s*320,\s*640\]/)
  assert.match(feedbackRoute, /promptHashFromDeferredTurn/)
  assert.match(feedbackRoute, /await wait\(delayMs\)/)
  assert.match(feedbackRoute, /COS turn correlation is still being finalized; retry feedback\./)
  assert.match(feedbackRoute, /hashPrompt\(userPrompt\) !== correlation\.promptHash/)
})
