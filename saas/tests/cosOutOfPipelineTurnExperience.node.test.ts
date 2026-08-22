import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { buildOutOfPipelineExperienceRow, ensureProvenanceTurnId } from '../lib/ai/cos/outOfPipelineTurn.ts'

const LIB = readFileSync(new URL('../lib/ai/cos/cosPrimaryTurnProvenance.ts', import.meta.url), 'utf8')
const BASE_ROUTE = readFileSync(new URL('../app/api/cos-primary/baseRoute.ts', import.meta.url), 'utf8')

test('preserves a pipeline turn id and mints one for a bypassed branch', () => {
  const existing: Record<string, unknown> = { turnId: '3f2a4b6c-1111-4222-8333-444455556666' }
  assert.equal(ensureProvenanceTurnId(existing), existing.turnId)
  const minted: Record<string, unknown> = {}
  assert.match(ensureProvenanceTurnId(minted) || '', /^[0-9a-f-]{36}$/i)
  assert.equal(ensureProvenanceTurnId(minted), minted.turnId)
  assert.equal(ensureProvenanceTurnId(null), null)
})

test('creates an honest, duplicate-safe experience row for a bypassed turn', () => {
  const row = buildOutOfPipelineExperienceRow('turn-1', { prompt: 'q?', answered: false, confidence: 1.7, branch: 'fresh_evidence_unavailable' }, prompt => `hash:${prompt}`)
  assert.equal(row.turn_id, 'turn-1')
  assert.equal(row.prompt_hash, 'hash:q?')
  assert.equal(row.problem_class, 'out_of_pipeline')
  assert.equal(row.reasoner_label, 'cos_primary:fresh_evidence_unavailable')
  assert.equal(row.answered, false)
  assert.equal(row.confidence, 1)
  assert.deepEqual(row.features, {})
  assert.match(LIB, /onConflict: 'turn_id', ignoreDuplicates: true/)
})

test('feedback-eligible cos-primary branches write the same provenance turn into experience', () => {
  for (const branch of [
    'authoritative_source_unavailable', 'authoritative_source', 'fresh_evidence_unavailable',
    'fresh_evidence_synthesis_rejected', 'external_fresh_grounded', 'fresh_local_grounded',
    'failed_closed', 'deterministic',
  ]) assert.match(BASE_ROUTE, new RegExp(`branch:'${branch}'`), branch)
  assert.match(BASE_ROUTE, /branch:assessment\?'self_healing_assessment':scan\.ok\?'repository_scan':'repository_scan_failed'/)
})
