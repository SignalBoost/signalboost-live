import assert from 'node:assert/strict'
import test from 'node:test'
import { isProvenanceIntrospection } from '../lib/ai/cos/provenanceIntrospection.ts'

test('a pasted Vercel build log never routes to prior-answer provenance', () => {
  const log = [
    '02:18:55.460 Running build in Cleveland, USA',
    '02:18:57.633 Running vercel build',
    'Vercel CLI 59.3.0',
    'Running node scripts/vercel-cos-gates.mjs && npm run prebuild && next build',
    '✔ answer source verification passed',
  ].join('\n')
  assert.equal(isProvenanceIntrospection(log), false)
})

test('a normal question about the preceding answer still routes to recorded provenance', () => {
  assert.equal(isProvenanceIntrospection('Where did you get your last answer from?'), true)
})
