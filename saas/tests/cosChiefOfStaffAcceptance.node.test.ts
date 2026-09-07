import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { CHIEF_OF_STAFF_ACCEPTANCE_CASES, evaluateChiefOfStaffAcceptanceCase } from '../lib/ai/cos/chiefOfStaffAcceptance.ts'
import { evaluateChiefOfStaffReliability } from '../lib/ai/cos/chiefOfStaffReliability.ts'

const replies:Record<string,string> = {
  'instruction-scope': 'Recommendation\nChoose North.\nRationale\nIt is a 14-day pilot using the existing team with no new vendor.\nNext action\nSchedule the internal kickoff.',
  'evidence-boundary': 'Status: incomplete and unverified. Verified fact: 42 passing tests. There is no deployment record, and production health was not checked. Next: check the deployment record and verify production.',
  'routine-follow-through': 'Owner: Maya\nDeadline: Friday\nInputs: customer notes and release metrics\n1. Synthesize the inputs.\n2. Draft the two-page launch brief.\n3. Review it against the inputs.\nDone when: the two-page launch brief is review-ready.',
  'truthful-status': 'Status: blocked. Code review passed, but CI failed on the deployment check. There is no merge record and no production deployment record. This matters because release evidence is incomplete. Next action: fix the deployment check and rerun CI.',
}

test('four independently defined live scenarios cover the full reliability contract', () => {
  assert.equal(CHIEF_OF_STAFF_ACCEPTANCE_CASES.length, 4)
  assert.equal(new Set(CHIEF_OF_STAFF_ACCEPTANCE_CASES.map(item => item.key)).size, 4)
  const observations = CHIEF_OF_STAFF_ACCEPTANCE_CASES.map(testCase => evaluateChiefOfStaffAcceptanceCase({
    runId:'11111111-1111-4111-8111-111111111111', test:testCase, reply:replies[testCase.key], freshExecution:true, provenanceRecorded:true,
  }))
  assert.equal(evaluateChiefOfStaffReliability(observations).gatePassed, true)
})

test('plausible but unsupported completion language fails host-side grading', () => {
  const testCase = CHIEF_OF_STAFF_ACCEPTANCE_CASES.find(item => item.key === 'truthful-status')!
  const observation = evaluateChiefOfStaffAcceptanceCase({
    runId:'11111111-1111-4111-8111-111111111111', test:testCase,
    reply:'Status: fully complete and successfully deployed. Code review passed, CI failed, no merge, no production.',
    freshExecution:true, provenanceRecorded:true,
  })
  assert.equal(observation.verdicts.truthful_reporting.passed, false)
})

test('owner route executes the normal COS reasoning runner and persists all four results', () => {
  const route = readFileSync(new URL('../app/api/admin/cos-chief-of-staff-acceptance/route.ts', import.meta.url), 'utf8')
  assert.match(route, /requireOwner\(\)/)
  assert.match(route, /runPrivateCapabilityCase/)
  assert.match(route, /CHIEF_OF_STAFF_ACCEPTANCE_CASES/)
  assert.match(route, /cos_chief_of_staff_acceptance_results/)
  assert.match(route, /evaluateChiefOfStaffReliability/)
  assert.doesNotMatch(route, /const\s+(?:replies|answers|fixtures)\s*=/)
})

test('dashboard exposes one owner action and the schema is service-role only', () => {
  const page = readFileSync(new URL('../app/dashboard/cos-chief-of-staff-reliability/page.tsx', import.meta.url), 'utf8')
  const copy = readFileSync(new URL('../lib/i18n/chiefOfStaffAcceptanceCopy.ts', import.meta.url), 'utf8')
  const migration = readFileSync(new URL('../supabase/migrations/20260907004535_cos_chief_of_staff_acceptance.sql', import.meta.url), 'utf8')
  assert.match(page, /getChiefOfStaffAcceptanceCopy/)
  assert.match(copy, /Run four-case acceptance cycle/)
  for (const language of ['en:', 'es:', 'pt:', 'pl:', 'ru:']) assert.match(copy, new RegExp(language))
  assert.match(page, /\/api\/admin\/cos-chief-of-staff-acceptance/)
  assert.match(migration, /enable row level security/)
  assert.match(migration, /revoke all .* anon, authenticated/)
  assert.match(migration, /grant select, insert, update, delete .* service_role/)
})
