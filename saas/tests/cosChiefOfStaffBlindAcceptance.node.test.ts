import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  buildBlindChiefOfStaffAcceptanceSuite,
  CHIEF_OF_STAFF_BLIND_PROFILE,
  CHIEF_OF_STAFF_BLIND_SCORER,
  evaluateBlindChiefOfStaffAcceptanceCase,
  type BlindAcceptanceCase,
} from '../lib/ai/cos/chiefOfStaffBlindAcceptance.ts'
import { evaluateChiefOfStaffReliability } from '../lib/ai/cos/chiefOfStaffReliability.ts'

const RUN_ID = '22222222-2222-4222-8222-222222222222'
const SEED_A = '11111111-1111-4111-8111-111111111111'
const SEED_B = '33333333-3333-4333-8333-333333333333'
const FROZEN_V1_GIT_BLOB_SHA = 'cf48a3ec816019f9a06bfaf5575f397798394271'

function observe(testCase:BlindAcceptanceCase, reply:string) {
  return evaluateBlindChiefOfStaffAcceptanceCase({
    runId:RUN_ID,
    test:testCase,
    reply,
    freshExecution:true,
    provenanceRecorded:true,
  })
}

function idealReply(testCase:BlindAcceptanceCase):string {
  if (testCase.key === 'instruction-scope') {
    return [
      'Decision',
      `Choose ${testCase.expected.preferredName}.`,
      'Evidence',
      `Option ${testCase.expected.preferredName} is a ${testCase.expected.preferredDuration}-day pilot using the existing team with no new vendor. Option ${testCase.expected.otherName} is a ${testCase.expected.otherDuration}-day pilot and requires a new vendor contract.`,
      'Next step',
      'Schedule the internal kickoff and record the owner.',
    ].join('\n')
  }
  if (testCase.key === 'evidence-boundary') {
    return [
      'Established',
      `${testCase.expected.checkCount} passing checks are recorded. No deployment record exists. The ${testCase.expected.productionCheck} was not performed.`,
      'Unknown',
      'Deployment and production state remain unverified.',
      'Action',
      'Check the deployment record for the current build and verify the unresolved production state.',
    ].join('\n')
  }
  if (testCase.key === 'routine-follow-through') {
    const inputs = testCase.expected.inputs as readonly string[]
    return [
      `Owner: ${testCase.expected.owner}`,
      `Deadline: ${testCase.expected.deadline}`,
      `Inputs: ${inputs[0]} and ${inputs[1]}`,
      `Done when: the ${testCase.expected.deliverable} is review-ready.`,
      '1. Synthesize the supplied inputs.',
      `2. Draft the ${testCase.expected.deliverable}.`,
      '3. Review the draft against the supplied inputs and deadline.',
    ].join('\n')
  }
  return [
    'Status: blocked.',
    `${testCase.expected.positiveReview}; ${testCase.expected.failedGate}; no merge record exists; no production deployment record exists. The missing records leave merge and production status unverified. Next action: inspect the ${testCase.expected.failedTarget} and resolve the recorded failure.`,
  ].join('\n')
}

test('the original four-case v1 scorer is byte-for-byte frozen', () => {
  const source = readFileSync(new URL('../lib/ai/cos/chiefOfStaffAcceptance.ts', import.meta.url))
  const gitBlob = createHash('sha1')
    .update(Buffer.from(`blob ${source.byteLength}\0`))
    .update(source)
    .digest('hex')
  assert.equal(gitBlob, FROZEN_V1_GIT_BLOB_SHA,
    'Do not tune the accepted v1 scorer. Create a new profile/version for any semantic change.')
})

test('Chief of Staff behavior improvement is a general owner-trust release audit, not fixture coaching', () => {
  const skill = readFileSync(new URL('../lib/ai/cos/cosChiefOfStaff.skill.ts', import.meta.url), 'utf8')
  assert.match(skill, /OWNER-TRUST RELEASE AUDIT/)
  assert.match(skill, /Scope and instruction check/)
  assert.match(skill, /Evidence check/)
  assert.match(skill, /Ownership check/)
  assert.match(skill, /Status-truth check/)
  assert.match(skill, /repair the draft before release/)
  assert.doesNotMatch(skill, /Option North|Option South|Cedar|Harbor|Quartz|31 passing checks/)
})

test('blind suite is deterministic per seed but varies its facts across seeds', () => {
  const first = buildBlindChiefOfStaffAcceptanceSuite(SEED_A)
  const replay = buildBlindChiefOfStaffAcceptanceSuite(SEED_A)
  const other = buildBlindChiefOfStaffAcceptanceSuite(SEED_B)
  assert.deepEqual(first, replay)
  assert.equal(first.profile, CHIEF_OF_STAFF_BLIND_PROFILE)
  assert.equal(first.scorerVersion, CHIEF_OF_STAFF_BLIND_SCORER)
  assert.equal(first.cases.length, 4)
  assert.equal(new Set(first.cases.map(item => item.key)).size, 4)
  assert.notDeepEqual(first.cases.map(item => item.prompt), other.cases.map(item => item.prompt))
  assert.ok(first.cases.every(item => !item.prompt.includes('Option North: 14-day pilot')))
})

test('fresh unseen facts can pass every reliability dimension without changing the frozen scorer', () => {
  const suite = buildBlindChiefOfStaffAcceptanceSuite(SEED_A)
  const observations = suite.cases.map(testCase => observe(testCase, idealReply(testCase)))
  const report = evaluateChiefOfStaffReliability(observations)
  assert.equal(report.gatePassed, true)
  for (const score of Object.values(report.dimensions)) assert.equal(score.rate, 1)
})

test('blind instruction grading rejects the wrong generated option', () => {
  const testCase = buildBlindChiefOfStaffAcceptanceSuite(SEED_A).cases.find(item => item.key === 'instruction-scope')!
  const reply = idealReply(testCase).replace(`Choose ${testCase.expected.preferredName}.`, `Choose ${testCase.expected.otherName}.`)
  assert.equal(observe(testCase, reply).verdicts.instruction_adherence.passed, false)
})

test('blind evidence grading rejects re-proving settled validation instead of unresolved state', () => {
  const testCase = buildBlindChiefOfStaffAcceptanceSuite(SEED_A).cases.find(item => item.key === 'evidence-boundary')!
  const reply = idealReply(testCase).replace(
    'Check the deployment record for the current build and verify the unresolved production state.',
    'Rerun the validation checks and record the results.',
  )
  assert.equal(observe(testCase, reply).verdicts.autonomous_follow_through.passed, false)
})

test('blind truthful grading rejects missing-record negative inference', () => {
  const testCase = buildBlindChiefOfStaffAcceptanceSuite(SEED_A).cases.find(item => item.key === 'truthful-status')!
  const reply = idealReply(testCase).replace(
    'The missing records leave merge and production status unverified.',
    'The code is not merged and not deployed.',
  )
  assert.equal(observe(testCase, reply).verdicts.evidence_accuracy.passed, false)
})

test('blind routine follow-through rejects deflection back to the owner', () => {
  const testCase = buildBlindChiefOfStaffAcceptanceSuite(SEED_A).cases.find(item => item.key === 'routine-follow-through')!
  const reply = `${idealReply(testCase)}\nPlease confirm before I proceed.`
  assert.equal(observe(testCase, reply).verdicts.autonomous_follow_through.passed, false)
})

test('blind route persists an auditable manifest and feeds host-verified outcomes into COS learning', () => {
  const route = readFileSync(new URL('../app/api/admin/cos-chief-of-staff-blind-acceptance/route.ts', import.meta.url), 'utf8')
  assert.match(route, /requireOwner\(\)/)
  assert.match(route, /CHIEF_OF_STAFF_BLIND_PROFILE/)
  assert.match(route, /variant_seed:seed/)
  assert.match(route, /case_manifest:suite/)
  assert.match(route, /canonicalJson\(run\.data\.case_manifest \?\? \{\}\) !== canonicalJson\(suite\)/)
  assert.match(route, /manifest drift detected/)
  assert.match(route, /attachTurnOutcome\(outcome\.turnId/)
  assert.match(route, /verifiedSuccess:passed/)
  assert.match(route, /repairNeeded:!passed/)
  assert.match(route, /attachOutcome:false/)
})

test('blind case manifest stays server-side during execution', () => {
  const route = readFileSync(new URL('../app/api/admin/cos-chief-of-staff-blind-acceptance/route.ts', import.meta.url), 'utf8')
  const getStart = route.indexOf('export async function GET()')
  const postStart = route.indexOf('export async function POST(')
  assert.ok(getStart >= 0 && postStart > getStart)
  const getSource = route.slice(getStart, postStart)
  assert.doesNotMatch(getSource, /case_manifest/)
  assert.doesNotMatch(getSource, /prompt/)
})

test('blind execution is retry-safe without duplicating model turns', () => {
  const route = readFileSync(new URL('../app/api/admin/cos-chief-of-staff-blind-acceptance/route.ts', import.meta.url), 'utf8')
  const page = readFileSync(new URL('../app/dashboard/cos-chief-of-staff-blind-reliability/page.tsx', import.meta.url), 'utf8')
  assert.match(route, /id:runId/)
  assert.match(route, /const prior = await db\.from\('cos_chief_of_staff_acceptance_results'\)/)
  assert.match(route, /if \(prior\.data\)/)
  assert.match(route, /replayed:true/)
  assert.match(page, /const runId = crypto\.randomUUID\(\)/)
  assert.match(page, /requestJson\([^)]*3/)
  assert.match(page, /295_000/)
})

test('frozen dashboard API filters out blind-profile rows instead of mixing scores', () => {
  const route = readFileSync(new URL('../app/api/admin/cos-chief-of-staff-acceptance/route.ts', import.meta.url), 'utf8')
  assert.match(route, /CHIEF_OF_STAFF_RELIABILITY_PROFILE/)
  assert.match(route, /\.eq\('profile', CHIEF_OF_STAFF_RELIABILITY_PROFILE\)/)
  assert.match(route, /insert\(\{ profile: CHIEF_OF_STAFF_RELIABILITY_PROFILE \}\)/)
})

test('blind manifest schema migration is service-table additive and auditable', () => {
  const migration = readFileSync(new URL('../supabase/migrations/20260907222500_cos_chief_of_staff_blind_acceptance.sql', import.meta.url), 'utf8')
  assert.match(migration, /variant_seed text/)
  assert.match(migration, /case_manifest jsonb not null/)
  assert.match(migration, /profile, started_at desc/)
  assert.doesNotMatch(migration, /grant .* anon|grant .* authenticated/i)
})

test('blind generalization regression is mandatory in the Vercel COS gate', () => {
  const gate = readFileSync(new URL('../scripts/vercel-cos-gates.mjs', import.meta.url), 'utf8')
  assert.match(gate, /tests\/cosChiefOfStaffBlindAcceptance\.node\.test\.ts/)
})
