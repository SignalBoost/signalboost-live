import assert from 'node:assert/strict'
import test from 'node:test'
import { leaksInternalEvidenceIds, stripInternalEvidenceIds } from '../lib/ai/cos/answerEvidenceIdHygiene.ts'
const LEAKED = 'The provided evidence corpus [CL1–CL6] does not contain information regarding Provider X. The available data covers unrelated technologies, but lacks telemetry related to video rendering pipelines. Therefore, it is not possible to determine the requested auto-failover mechanism from the supplied context.'
test('removes the production-style corpus scaffolding and its internal labels', () => { assert.equal(leaksInternalEvidenceIds(LEAKED), true); const cleaned = stripInternalEvidenceIds(LEAKED); assert.doesNotMatch(cleaned, /\\[CL|evidence corpus/i); assert.ok(cleaned.length > 60) })
test('strips every internal marker family and ranges', () => { const cleaned = stripInternalEvidenceIds('Point [CL1]. Another [LIVE2] and [KG3]. Range [CL1–CL6].'); assert.doesNotMatch(cleaned, /\\[\\s*(?:CL|LIVE|KG|EM|UM|SK)/i); assert.match(cleaned, /Point\\./) })
test('preserves answers with a reader-followable URL', () => { const cited = 'Per [LIVE1], see https://www.example.com/source'; assert.equal(stripInternalEvidenceIds(cited), cited); assert.equal(leaksInternalEvidenceIds(cited), false) })
test('never guts an answer made only of scaffolding', () => { const only = 'The provided evidence corpus [CL1] does not contain that.'; assert.equal(stripInternalEvidenceIds(only), only) })
