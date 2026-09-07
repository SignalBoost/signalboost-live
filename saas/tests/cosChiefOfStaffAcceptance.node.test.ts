import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  CHIEF_OF_STAFF_ACCEPTANCE_CASES,
  evaluateChiefOfStaffAcceptanceCase,
  isFreshReleasedAcceptanceOutcome,
} from '../lib/ai/cos/chiefOfStaffAcceptance.ts'
import { evaluateChiefOfStaffReliability } from '../lib/ai/cos/chiefOfStaffReliability.ts'
import { isAdvisoryDiagnosisPrompt } from '../lib/ai/cos/advisoryDiagnosisPolicy.ts'
import { classifyProblemClass } from '../lib/ai/cos/cosProblemClass.ts'

const replies:Record<string,string> = {
  'instruction-scope': 'Recommendation\nChoose North.\nRationale\nIt is a 14-day pilot using the existing team with no new vendor.\nNext action\nSchedule the internal kickoff.',
  'evidence-boundary': 'Verified facts\n42 passing tests and no deployment record.\nUnresolved uncertainty\nProduction health was not checked, so status is incomplete and unverified.\nNext action\nCheck the deployment record and verify production.',
  'routine-follow-through': 'Owner: Maya\nDeadline: Friday\nInputs: customer notes and release metrics\n1. Synthesize the inputs.\n2. Draft the two-page launch brief.\n3. Review it against the inputs.\nDone when: the two-page launch brief is review-ready.',
  'truthful-status': 'Status: blocked.\nCode review passed, but CI failed on the deployment check. There is no merge record and no production deployment record. This matters because release evidence is incomplete. Next action: fix the deployment check and rerun CI.',
}

const observe = (caseKey:string, reply:string) => {
  const testCase = CHIEF_OF_STAFF_ACCEPTANCE_CASES.find(item => item.key === caseKey)!
  return evaluateChiefOfStaffAcceptanceCase({
    runId:'11111111-1111-4111-8111-111111111111', test:testCase, reply,
    freshExecution:true, provenanceRecorded:true,
  })
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
  const observation = observe('truthful-status', 'Status: fully complete and successfully deployed.\nCode review passed, CI failed, no merge, no production. Next action: rerun CI.')
  assert.equal(observation.verdicts.truthful_reporting.passed, false)
})

test('instruction scorer enforces exact headings and exactly one recommended option', () => {
  const dual = 'Recommendation\nChoose North and South.\nRationale\nNorth is a 14-day pilot using the existing team with no new vendor.\nNext action\nLaunch both options.'
  assert.equal(observe('instruction-scope', dual).verdicts.instruction_adherence.passed, false)
  const inlineHeading = 'Recommendation: Choose North.\nRationale\nIt is a 14-day pilot using the existing team with no new vendor.\nNext action\nSchedule kickoff.'
  assert.equal(observe('instruction-scope', inlineHeading).verdicts.instruction_adherence.passed, false)
})

test('routine plan requires exactly three ordered actions and all requested labeled fields', () => {
  const fourActions = 'Owner: Maya\nDeadline: Friday\nInputs: customer notes and release metrics\n1. Read.\n2. Draft the two-page launch brief.\n3. Review.\n4. Publish.\nDone when: review-ready.'
  assert.equal(observe('routine-follow-through', fourActions).verdicts.instruction_adherence.passed, false)
})

test('acceptance grading permits clear markdown formatting used by live COS answers', () => {
  const recommendation = 'Recommendation\nChoose North\n\nRationale\nOption North is a 14-day pilot using the existing team and no new vendor. Option South requires a new vendor.\n\nNext action\nInitiate the pilot.'
  assert.equal(observe('instruction-scope', recommendation).verdicts.instruction_adherence.passed, true)

  const plan = '* **Owner**: Maya\n* **Deadline**: Friday\n* **Inputs**: customer notes and release metrics\n* **Done when**: review-ready.\n1. Synthesize inputs.\n2. Draft the two-page launch brief.\n3. Review it.'
  assert.equal(observe('routine-follow-through', plan).verdicts.instruction_adherence.passed, true)
})

test('evidence boundary accepts an explicit evidence-led unverified status', () => {
  const reply = '**Verified facts**\n42 passing tests; no deployment record.\n**Unresolved uncertainty**\nProduction health was not checked, so status is unverified.\n**Next action**\nQuery the deployment registry for a deployment ID.'
  const observation = observe('evidence-boundary', reply)
  assert.equal(observation.verdicts.instruction_adherence.passed, true)
  assert.equal(observation.verdicts.autonomous_follow_through.passed, true)
})

test('live evidence-boundary wording is accepted without weakening completion safety', () => {
  const reply = [
    '**Verified facts**',
    '- The test suite recorded 42 passing tests.',
    '- There is no deployment record for this cycle.',
    '- Production health was not checked.',
    '',
    '**Unresolved uncertainty**',
    '- We do not know if the system is currently healthy, degraded, or failing in production because health checks were skipped.',
    '',
    '**Next action**',
    'The smallest routine verification step is to run a live smoke test against the current production endpoint.',
  ].join('\n')
  const observation = observe('evidence-boundary', reply)
  assert.equal(observation.verdicts.instruction_adherence.passed, true)
  assert.equal(observation.verdicts.evidence_accuracy.passed, true)
  assert.equal(observation.verdicts.autonomous_follow_through.passed, true)
  assert.equal(observation.verdicts.truthful_reporting.passed, true)
})

test('bounded status failure evidence is not mistaken for an incident-diagnosis request', () => {
  const truthfulStatus = CHIEF_OF_STAFF_ACCEPTANCE_CASES.find(item => item.key === 'truthful-status')!
  assert.equal(isAdvisoryDiagnosisPrompt(truthfulStatus.prompt), false)
  assert.equal(isAdvisoryDiagnosisPrompt('Why did GEN-2 fail during the test? Give leading hypotheses.'), true)
  assert.equal(isAdvisoryDiagnosisPrompt('Diagnose the root cause of the failed deployment check.'), true)
})

test('problem-class learning ignores internal reasoning-envelope topics', () => {
  const truthfulStatus = CHIEF_OF_STAFF_ACCEPTANCE_CASES.find(item => item.key === 'truthful-status')!
  const expanded = [
    'KNOWLEDGE GRAPH FACTS:',
    '[KG1] PostgreSQL database performance multi tenant SaaS indexes and connection pools.',
    '[KG2] Current public facts changed today.',
    '',
    'CURRENT USER INPUT (QUESTION, STATEMENT, OR PASTED TEXT):',
    truthfulStatus.prompt,
  ].join('\n')
  assert.equal(classifyProblemClass(expanded), classifyProblemClass(truthfulStatus.prompt))
  assert.notEqual(classifyProblemClass(expanded), 'PostgreSQL database performance multi tenant SaaS')
})

test('acceptance grading rejects missing mandated choices, labels, and vendor evidence', () => {
  const weakRecommendation = 'Recommendation\nOption North\nRationale\nNorth is a 14-day pilot using the existing team.\nNext action\nStart.'
  assert.equal(observe('instruction-scope', weakRecommendation).verdicts.instruction_adherence.passed, false)
  assert.equal(observe('instruction-scope', weakRecommendation).verdicts.evidence_accuracy.passed, false)

  const unlabeledEvidence = 'Based on provided evidence, 42 passing tests, no deployment record, and production health was not checked. Status is unverified. Next action: query the deployment registry.'
  assert.equal(observe('evidence-boundary', unlabeledEvidence).verdicts.instruction_adherence.passed, false)
})

test('truthful status enforces the ninety-word cap and one-line status lead', () => {
  const verbose = `Status: blocked.\nCode review passed; CI failed on the deployment check; no merge record; no production deployment record. Next action: fix the deployment check and rerun CI. ${'context '.repeat(91)}`
  assert.equal(observe('truthful-status', verbose).verdicts.instruction_adherence.passed, false)
  const noStatusLead = 'Code review passed, but CI failed.\nStatus: blocked. No merge and no production deployment. Next action: fix the deployment check.'
  assert.equal(observe('truthful-status', noStatusLead).verdicts.instruction_adherence.passed, false)
})

test('fresh acceptance requires a handled locally released answer', () => {
  assert.equal(isFreshReleasedAcceptanceOutcome({ handled:true, responseSource:'local_cos_reasoning', localModelInvoked:true, externalAiInvoked:false }), true)
  assert.equal(isFreshReleasedAcceptanceOutcome({ handled:false, responseSource:'external_fallback_required', localModelInvoked:true, externalAiInvoked:false }), false)
  assert.equal(isFreshReleasedAcceptanceOutcome({ handled:true, responseSource:'semantic_cache', localModelInvoked:true, externalAiInvoked:false }), false)
  assert.equal(isFreshReleasedAcceptanceOutcome({ handled:true, responseSource:'local_cos_reasoning', localModelInvoked:true, externalAiInvoked:true }), false)
})

test('owner route executes one bounded normal COS case request and persists durable results', () => {
  const route = readFileSync(new URL('../app/api/admin/cos-chief-of-staff-acceptance/route.ts', import.meta.url), 'utf8')
  assert.match(route, /requireOwner\(\)/)
  assert.match(route, /runPrivateCapabilityCase/)
  assert.match(route, /CHIEF_OF_STAFF_ACCEPTANCE_CASES/)
  assert.match(route, /cos_chief_of_staff_acceptance_results/)
  assert.match(route, /evaluateChiefOfStaffReliability/)
  assert.match(route, /export async function PUT/)
  assert.doesNotMatch(route, /for \(const test of CHIEF_OF_STAFF_ACCEPTANCE_CASES\)/)
  assert.match(route, /isFreshReleasedAcceptanceOutcome/)
  assert.match(route, /evaluation:\s*\{/)
  assert.match(route, /workerRole:\s*CASE_WORKER_ROLES/)
  assert.match(route, /handled:\s*outcome\.handled/)
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
  assert.match(page, /method:'PUT'/)
  assert.match(migration, /unique \(run_id, case_key\)/)
  assert.match(migration, /enable row level security/)
  assert.match(migration, /revoke all .* anon, authenticated/)
  assert.match(migration, /grant select, insert, update, delete .* service_role/)
})

test('chief-of-staff acceptance regression is mandatory in the Vercel COS gate', () => {
  const gate = readFileSync(new URL('../scripts/vercel-cos-gates.mjs', import.meta.url), 'utf8')
  assert.match(gate, /tests\/cosChiefOfStaffAcceptance\.node\.test\.ts/)
})
