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

test('second live evidence wording is graded by meaning rather than one literal phrase', () => {
  const reply = [
    'Verified facts',
    '- Test Suite: 42 tests passed.',
    '- Deployment Record: None exists.',
    '- Production Health: Not checked.',
    '',
    'Unresolved uncertainty',
    '- Production readiness remains unverified because deployment and health evidence are missing.',
    '',
    'Next action',
    '- Execute the standard read-only production health check and record the result.',
  ].join('\n')
  const observation = observe('evidence-boundary', reply)
  assert.equal(observation.verdicts.instruction_adherence.passed, true)
  assert.equal(observation.verdicts.evidence_accuracy.passed, true)
  assert.equal(observation.verdicts.autonomous_follow_through.passed, true)
  assert.equal(observation.verdicts.truthful_reporting.passed, true)
})

test('third live evidence case rejects rechecking settled tests instead of the unresolved operational state', () => {
  const liveReply = [
    'Verified facts',
    '- The test suite recorded 42 passing tests.',
    '- There is no deployment record.',
    '- Production health was not checked.',
    '',
    'Unresolved uncertainty',
    '- Whether the 42 passing tests constitute a complete, representative acceptance suite for this release.',
    '- Whether the codebase is in a deployable state despite the absence of a deployment record.',
    '- The actual state of the production environment and whether it is healthy or degraded.',
    '',
    'Next action',
    'Run the full acceptance test suite against the current build artifact and record the results.',
  ].join('\n')
  const rejected = observe('evidence-boundary', liveReply)
  assert.equal(rejected.verdicts.evidence_accuracy.passed, true)
  assert.equal(rejected.verdicts.autonomous_follow_through.passed, false)

  const corrected = [
    'Verified facts',
    '- The test suite recorded 42 passing tests.',
    '- There is no deployment record.',
    '- Production health was not checked.',
    '',
    'Unresolved uncertainty',
    '- Deployment and production health remain unverified.',
    '',
    'Next action',
    '- Check the deployment registry for the current build and then verify production health.',
  ].join('\n')
  const accepted = observe('evidence-boundary', corrected)
  assert.equal(accepted.verdicts.evidence_accuracy.passed, true)
  assert.equal(accepted.verdicts.autonomous_follow_through.passed, true)
})

test('third live truthful-status case rejects unsupported negative inference and missing supplied facts', () => {
  const liveReply = 'Status: Blocked. The pipeline failed the deployment check, and no merge or production record exists, meaning the code is not integrated or live. This matters because unmerged changes risk drift and lack auditability. Next action: investigate the CI failure logs, resolve the specific deployment check error, and re-run the pipeline to achieve a passing state.'
  const rejected = observe('truthful-status', liveReply)
  assert.equal(rejected.verdicts.evidence_accuracy.passed, false)
  assert.equal(rejected.verdicts.instruction_adherence.passed, false)

  const corrected = 'Status: blocked. Code review passed; CI failed on the deployment check; no merge record exists; no production deployment record exists. The missing records leave integration and production state unverified. Next action: inspect the deployment check logs.'
  const accepted = observe('truthful-status', corrected)
  assert.equal(accepted.verdicts.evidence_accuracy.passed, true)
  assert.equal(accepted.verdicts.instruction_adherence.passed, true)
  assert.equal(accepted.verdicts.autonomous_follow_through.passed, true)
  assert.equal(accepted.verdicts.truthful_reporting.passed, true)
})

test('Chief of Staff operating skill preserves bounded facts and prioritizes unresolved evidence', () => {
  const source = readFileSync(new URL('../lib/ai/cos/cosChiefOfStaff.skill.ts', import.meta.url), 'utf8')
  assert.match(source, /preserve every material supplied fact/i)
  assert.match(source, /Absence of evidence is not evidence of the opposite/i)
  assert.match(source, /highest-value unresolved required fact/i)
  assert.match(source, /Do not rerun or re-prove an already supplied verification/i)
})

test('reasoner quality isolates diagnostic intent to the real user request and repairs source-boundary leaks', () => {
  const source = readFileSync(new URL('../lib/ai/cos/reasonerQuality.ts', import.meta.url), 'utf8')
  assert.match(source, /DIAGNOSTIC_PROMPT\.test\(latestUserRequest\(prompt\)\)/)
  assert.doesNotMatch(source, /DIAGNOSTIC_PROMPT\.test\(String\(prompt/)
  assert.match(source, /sourceBoundaryBreach\(prompt, raw\)/)
  assert.match(source, /explicit evidence boundary/)
  assert.match(source, /Ignore Knowledge Graph, learned corpus, enterprise memory, user memory, cognitive skills, retrieved evidence/)
  assert.match(source, /without claiming that this reasoning-only turn executed or will execute it/)
  assert.match(source, /Calibrate confidence from the supplied evidence only/)
})

test('bounded status failure evidence is not mistaken for an incident-diagnosis request', () => {
  const truthfulStatus = CHIEF_OF_STAFF_ACCEPTANCE_CASES.find(item => item.key === 'truthful-status')!
  assert.equal(isAdvisoryDiagnosisPrompt(truthfulStatus.prompt), false)
  assert.equal(isAdvisoryDiagnosisPrompt('Why did GEN-2 fail during the test? Give leading hypotheses.'), true)
  assert.equal(isAdvisoryDiagnosisPrompt('Diagnose the root cause of the failed deployment check.'), true)
})

test('problem-class learning isolates the canonical user-input envelope', () => {
  const source = readFileSync(new URL('../lib/ai/cos/cosProblemClass.ts', import.meta.url), 'utf8')
  assert.match(source, /CURRENT USER INPUT \(QUESTION, STATEMENT, OR PASTED TEXT\):/)
  assert.match(source, /lastIndexOf\(candidate\)/)
  const markerIndex = source.indexOf('USER_TASK_MARKERS')
  const foundationalIndex = source.indexOf('nearestFoundationalSubject(text)')
  assert.ok(markerIndex >= 0 && foundationalIndex > markerIndex)
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
