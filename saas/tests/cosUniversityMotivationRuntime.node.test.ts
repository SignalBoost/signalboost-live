import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const runtime = fs.readFileSync(new URL('../lib/ai/cos/cosUniversityMotivationRuntime.ts', import.meta.url), 'utf8')
const outcome = fs.readFileSync(new URL('../lib/ai/cos/cognitiveVerifiedOutcome.ts', import.meta.url), 'utf8')
const migration = fs.readFileSync(new URL('../supabase/migrations/20260910230809_cos_university_motivation_evidence.sql', import.meta.url), 'utf8')

test('motivation evidence is freshness-bound and integrity comes from host evidence', () => {
  assert.match(runtime, /valid_until/)
  assert.match(runtime, /expires_at/)
  assert.match(runtime, /Date\.parse\(value\) > now\.getTime\(\)/)
  assert.match(runtime, /event_type === 'integrity_violation'/)
  assert.match(runtime, /row\.verifier === 'host_controller'/)
  assert.doesNotMatch(runtime, /integrityViolations: 0/)
})

test('verified improved outcomes are the runtime bridge for teamwork credit', () => {
  assert.match(outcome, /universityOutcome\?\.stored && universityOutcome\.promotionEligible/)
  assert.match(outcome, /recordCosUniversityTeamContribution\(/)
  assert.match(outcome, /beneficiaryOutcomeEvidenceRef: universityOutcome\.evidenceRef/)
})

test('database admits bounded motivation evidence classes', () => {
  assert.match(migration, /'team_contribution'/)
  assert.match(migration, /'integrity_violation'/)
})
