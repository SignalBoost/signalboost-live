import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { ensureAnswerExecutionProvenance } from '../lib/ai/cos/answerProvenance.ts'
import {
  createPublicAnswerProvenanceCapsule,
  publicAnswerCapsuleAsRecordedProvenance,
  verifyPublicAnswerProvenanceCapsule,
} from '../lib/ai/cos/publicAnswerProvenanceCapsule.ts'
import { renderPublicRecordedProvenance } from '../lib/ai/cos/publicRecordedProvenance.ts'

const SIGNING_KEY = 'test-only-provenance-signing-key'

test('every response payload can produce server-observed provenance even without a model-supplied record', () => {
  const provenance = ensureAnswerExecutionProvenance({
    reply: 'A deterministic answer.',
    source: 'deterministic-current-date',
    local_model_invoked: false,
    external_ai_invoked: false,
  }) as any
  assert.equal(provenance.authority, 'server_execution_telemetry')
  assert.equal(provenance.response_source, 'deterministic-current-date')
  assert.equal(provenance.deterministic_utility.used, true)
  assert.equal(provenance.local_reasoning.invoked, false)
  assert.equal(provenance.external_ai.invoked, false)
})

test('signed provenance capsule is bound to the exact delivered answer', () => {
  const previous = process.env.COS_PROVENANCE_SIGNING_KEY
  process.env.COS_PROVENANCE_SIGNING_KEY = SIGNING_KEY
  try {
    const payload = {
      reply: 'Palmeiras is one evidence-backed candidate.',
      source: 'cos-local-primary',
      execution_provenance: {
        authority: 'server_execution_telemetry',
        response_source: 'cos-local-primary',
        lineage_completeness: 'runtime_recorded',
        local_reasoning: { invoked: true, model: 'local-test-model' },
        external_ai: { invoked: false, provider: null, model: null },
        live_external_evidence: {
          used: true,
          sources: [
            { title: 'CBF ranking', url: 'https://www.cbf.com.br/ranking' },
            { title: 'CONMEBOL history', url: 'https://www.conmebol.com/history' },
          ],
        },
        answer_origin: { from_cache: false },
      },
    }
    const capsule = createPublicAnswerProvenanceCapsule(payload, payload.reply)
    assert.equal(capsule.signed, true)
    assert.ok(capsule.signature)
    assert.ok(verifyPublicAnswerProvenanceCapsule(capsule, payload.reply))
    assert.equal(verifyPublicAnswerProvenanceCapsule(capsule, `${payload.reply} altered`), null)

    const recorded = publicAnswerCapsuleAsRecordedProvenance(capsule)
    const rendered = renderPublicRecordedProvenance(recorded, 'pt')
    assert.match(rendered, /Origem registrada/i)
    assert.match(rendered, /raciocinador local/i)
    assert.match(rendered, /Fontes registradas/i)
    assert.match(rendered, /https:\/\/www\.cbf\.com\.br\/ranking/)
    assert.match(rendered, /https:\/\/www\.conmebol\.com\/history/)
    assert.doesNotMatch(rendered, /Não tenho um registro verificável/i)
  } finally {
    if (previous === undefined) delete process.env.COS_PROVENANCE_SIGNING_KEY
    else process.env.COS_PROVENANCE_SIGNING_KEY = previous
  }
})

test('a model-only answer still explains its recorded origin instead of pretending provenance is unavailable', () => {
  const reply = renderPublicRecordedProvenance({
    authority: 'server_execution_telemetry',
    response_source: 'cos-local-primary',
    lineage_completeness: 'runtime_recorded',
    local_reasoning: { invoked: true, model: 'qwen-local' },
    external_ai: { invoked: false, provider: null, model: null },
    deterministic_utility: { used: false, utility: null },
    live_external_evidence: { used: false, sources: [] },
    answer_origin: { from_cache: false },
  }, 'en')
  assert.match(reply, /Recorded origin:/i)
  assert.match(reply, /local reasoner/i)
  assert.match(reply, /No live external sources were recorded/i)
  assert.doesNotMatch(reply, /don't have a verifiable provenance record/i)
})

test('browser ingress is forced through the mandatory provenance wrapper', () => {
  const proxy = readFileSync(new URL('../proxy.ts', import.meta.url), 'utf8')
  const route = readFileSync(new URL('../app/api/cos-provenance-browser/route.ts', import.meta.url), 'utf8')
  assert.match(proxy, /target\.pathname = '\/api\/cos-provenance-browser'/)
  assert.match(proxy, /pathname === '\/api\/concierge'/)
  assert.match(proxy, /pathname === '\/api\/cos-browser'/)
  assert.match(proxy, /pathname === '\/api\/cos-primary'/)
  assert.match(route, /POST as cosBrowserPost/)
  assert.match(route, /ensureAnswerExecutionProvenance/)
  assert.match(route, /createPublicAnswerProvenanceCapsule/)
  assert.match(route, /recordLatestUserTurnProvenance/)
  assert.match(route, /PROVENANCE_COOKIE/)
  assert.match(route, /verifyPublicAnswerProvenanceCapsule/)
  assert.match(route, /provenance_match_verified: true/)
})
