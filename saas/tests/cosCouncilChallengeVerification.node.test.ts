import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import type { CouncilAdvisory, CouncilOpinion } from '@/lib/ai/cos/cognitiveCouncil'
import {
  councilChallengePairBudget,
  selectCouncilChallengePairs,
} from '@/lib/ai/cos/cognitiveCouncilChallenge'
import {
  CouncilVerificationError,
  isAcceptedCouncilVerificationSource,
  normalizeCouncilVerificationRequest,
  normalizeCouncilVerificationVerdicts,
} from '@/lib/ai/cos/councilVerification'

function opinion(role: CouncilOpinion['role'], options: { evidence?: string[]; assumptions?: string[] } = {}): CouncilOpinion {
  return {
    role,
    conclusion: `${role} conclusion`,
    claims: [{
      claim: `${role} claim`,
      evidence: options.evidence ?? [],
      assumptions: options.assumptions ?? [],
      observable: 'specific observable',
      falsifier: 'specific falsifier',
    }],
    confidence: 0.8,
    verificationRequests: [],
    credibilityWeight: 1,
  }
}

test('skeptic challenges the most assumption-heavy weakly grounded claim first', () => {
  const pairs = selectCouncilChallengePairs([
    opinion('architect', { evidence: ['[KG1]'] }),
    opinion('database', { assumptions: ['tenant skew', 'plan change'] }),
    opinion('skeptic'),
  ], 1)

  assert.deepEqual(pairs, [{ challengerRole: 'skeptic', targetRole: 'database', targetClaimIndex: 0 }])
})

test('high-consequence and conflicted Council cases may use two bounded challenge pairs', () => {
  const base = {
    sessionId: '00000000-0000-4000-8000-000000000001',
    problemClass: 'database latency',
    roles: ['database', 'sre', 'skeptic'],
    opinions: [opinion('database'), opinion('sre'), opinion('skeptic')],
    advisory: 'advisory',
  } as unknown as CouncilAdvisory

  assert.equal(councilChallengePairBudget({
    ...base,
    trigger: { region: 'strong', repeatedGapCount: 0, evidenceSparse: false, highConsequence: true, complexProblem: true, trigger: true, reasons: ['high consequence'] },
  }), 2)
  assert.equal(councilChallengePairBudget({
    ...base,
    trigger: { region: 'conflicted', repeatedGapCount: 0, evidenceSparse: false, highConsequence: false, complexProblem: true, trigger: true, reasons: ['conflicted'] },
  }), 2)
})

test('model consensus is never accepted as Council verification evidence', () => {
  assert.equal(isAcceptedCouncilVerificationSource('deterministic_tool'), true)
  assert.equal(isAcceptedCouncilVerificationSource('production_outcome'), true)
  assert.equal(isAcceptedCouncilVerificationSource('model_consensus'), false)
  assert.throws(() => normalizeCouncilVerificationRequest({
    sessionId: '00000000-0000-4000-8000-000000000001',
    sourceClass: 'model_consensus',
    sourceRef: 'model:qwen',
    summary: 'the models agree',
    verdicts: [{ role: 'sre', verdict: 'supported' }],
  }), CouncilVerificationError)
})

test('verification verdicts require an externally scored role and reject duplicates', () => {
  assert.throws(() => normalizeCouncilVerificationVerdicts([
    { role: 'sre', verdict: 'not_scored' },
  ]), /At least one role/)

  assert.throws(() => normalizeCouncilVerificationVerdicts([
    { role: 'sre', verdict: 'supported' },
    { role: 'sre', verdict: 'refuted' },
  ]), /Duplicate Council verdict/)
})

test('database migration restricts the atomic credibility function to the service role', () => {
  const migration = readFileSync('supabase/migrations/20260815_cos_council_challenge_verification.sql', 'utf8')
  assert.match(migration, /create table if not exists public\.cos_council_challenges/)
  assert.match(migration, /create table if not exists public\.cos_council_rebuttals/)
  assert.match(migration, /create table if not exists public\.cos_council_verifications/)
  assert.match(migration, /revoke all on function public\.cos_record_council_verified_outcome/)
  assert.match(migration, /grant execute on function public\.cos_record_council_verified_outcome\(uuid,text,text,text,jsonb,jsonb\) to service_role/)
})
