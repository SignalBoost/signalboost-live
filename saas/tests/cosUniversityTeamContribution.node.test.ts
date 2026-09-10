import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const source = fs.readFileSync(path.resolve(import.meta.dirname, '../lib/ai/cos/cosUniversityTeamContribution.ts'), 'utf8')

test('team credit is independent, outcome-linked, append-only, and rejects self-credit', () => {
  assert.match(source, /self_contribution_prohibited/)
  assert.match(source, /beneficiaryOutcomeEvidenceRef/)
  assert.match(source, /independentScorer === true/)
  assert.match(source, /event_type: 'team_contribution'/)
  assert.match(source, /expires_at: validUntil\.toISOString\(\)/)
  assert.doesNotMatch(source, /\.from\([^)]*\)\.update\(|\.delete\(/)
})
