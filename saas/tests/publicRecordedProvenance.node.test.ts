import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  extractPublicRecordedProvenance,
  renderPublicRecordedProvenance,
} from '../lib/ai/cos/publicRecordedProvenance.ts'

const FLIGHT_RECORD = {
  delivery_scope: 'public_concierge',
  local_reasoning: { invoked: true, model: 'internal-model-name-must-not-be-exposed' },
  external_ai: { invoked: false },
  live_external_evidence: {
    used: true,
    sources: [
      { id: 'LIVE1', title: 'PBM to GRU route page', url: 'https://www.flightconnections.com/flights-from-pbm-to-gru' },
      { id: 'LIVE3', title: 'Paramaribo to São Paulo flights', url: 'https://www.kiwi.com/en/cheap-flights/paramaribo-suriname/sao-paulo-state-of-sao-paulo-brazil/' },
    ],
  },
  answer_origin: { from_cache: false },
}

test('public provenance reports the exact recorded live sources and never reconstructs from model memory', () => {
  const reply = renderPublicRecordedProvenance(FLIGHT_RECORD, 'en')
  assert.match(reply, /live public evidence was used/i)
  assert.match(reply, /flightconnections\.com\/flights-from-pbm-to-gru/)
  assert.match(reply, /kiwi\.com\/en\/cheap-flights/)
  assert.match(reply, /actual turn record/i)
  assert.doesNotMatch(reply, /illustrative/i)
  assert.doesNotMatch(reply, /training|general knowledge|internal-model-name/i)
})

test('missing provenance fails closed instead of inventing an origin', () => {
  const reply = renderPublicRecordedProvenance(null, 'en')
  assert.match(reply, /don't have a verifiable provenance record/i)
  assert.match(reply, /won't reconstruct or guess/i)
  assert.doesNotMatch(reply, /training|memory|general knowledge/i)
})

test('recorded live-evidence use without URLs says URLs are unavailable rather than fabricating them', () => {
  const reply = renderPublicRecordedProvenance({ live_external_evidence: { used: true, sources: [] } }, 'en')
  assert.match(reply, /live public evidence was used/i)
  assert.match(reply, /does not contain source URLs/i)
  assert.match(reply, /won't invent/i)
})

test('source extraction also preserves answer-origin live source lineage', () => {
  const facts = extractPublicRecordedProvenance({
    answer_origin: {
      from_cache: false,
      live_evidence_sources: [{ title: 'Official source', url: 'https://example.gov/fact' }],
    },
  })
  assert.equal(facts.sources.length, 1)
  assert.equal(facts.sources[0].url, 'https://example.gov/fact')
  assert.equal(facts.liveEvidenceUsed, true)
})

test('the real public Concierge boundary reads recorded provenance and does not invoke a model for provenance introspection', () => {
  const route = readFileSync(new URL('../app/api/cos-browser/route.ts', import.meta.url), 'utf8')
  assert.match(route, /readCosPrimaryPriorProvenance/)
  assert.match(route, /renderPublicRecordedProvenance/)
  assert.match(route, /local_model_invoked:\s*false/)
  assert.doesNotMatch(route, /dynamicPublicSourceExplanation/)
  assert.doesNotMatch(route, /callCosReasoner/)
  assert.doesNotMatch(route, /parseLocalResult/)
})

test('the public support boundary also renders recorded provenance without a provenance-time model call', () => {
  const route = readFileSync(new URL('../app/api/support/route.ts', import.meta.url), 'utf8')
  assert.match(route, /recordedTurnProvenanceByContent/)
  assert.match(route, /renderPublicRecordedProvenance/)
  assert.match(route, /support-public-provenance-recorded/)
  assert.match(route, /local_model_invoked:\s*false/)
  assert.doesNotMatch(route, /acceptPublicNarrative/)
  assert.doesNotMatch(route, /buildPublicProvenanceInstruction/)
  assert.doesNotMatch(route, /emergencyPublicProvenance/)
  assert.doesNotMatch(route, /callLocalModel/)
})
