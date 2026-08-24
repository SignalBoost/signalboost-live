import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('../lib/ai/cos/cosFirstAnswerEnterprise.ts', import.meta.url), 'utf8')
test('primary answer release runs executive-claim repair before caching', () => {
  const release = source.slice(source.indexOf('const parsed = parseLocalResult') > -1 ? source.indexOf('const parsed = parseLocalResult') : source.indexOf('let parsed = parseLocalResult'), source.indexOf('const cited = citedEvidence'))
  assert.match(release, /EXECUTIVE RELEASE REPAIR/)
  assert.match(release, /Executive answer release rejected/)
  assert.match(release, /executiveDecisionUnsupportedClaims/)\n  assert.match(release, /requiresRelevantLearnedEvidenceUse/)\n  assert.match(release, /relevant_learned_evidence_not_used/)\n  assert.match(release, /INTERNAL EVIDENCE:/)
})
