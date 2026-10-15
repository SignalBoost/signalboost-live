import assert from 'node:assert/strict'
import test from 'node:test'
import { freshEvidenceSearchQuery } from '../lib/ai/cos/cosFreshGroundingBase.ts'

const now = new Date('2026-10-15T12:00:00.000Z')

test('definition queries preserve product identifiers without unrelated current-event modifiers', () => {
  for (const question of [
    'What is REA - Reverse Engineer Anything and how does it work?',
    'Explain the Kubernetes platform and how it works',
    'What is the FastAPI framework used for?',
  ]) {
    const query = freshEvidenceSearchQuery(question, now)
    assert.equal(query, question)
    assert.doesNotMatch(query, /official authoritative independent verification as of/i)
  }
})

test('volatile queries retain live verification and dates', () => {
  const query = freshEvidenceSearchQuery('Who is the current president of Brazil?', now)
  assert.match(query, /official authoritative current as of 2026-10-15/i)
  const release = freshEvidenceSearchQuery('What is the latest version of the FastAPI framework?', now)
  assert.match(release, /2026-10-15/)
})
