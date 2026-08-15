import { callLocalModel, localInferenceConfigFromEnv } from '@/lib/ai/local-inference'
import { touchRunpodActivityLease } from '@/lib/ai/cos/runpodActivityLease'
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import type { CouncilAdvisory, CouncilOpinion, CouncilRole } from '@/lib/ai/cos/cognitiveCouncil'

export type CouncilChallengePair = {
  challengerRole: CouncilRole
  targetRole: CouncilRole
  targetClaimIndex: number
}

export type CouncilChallenge = CouncilChallengePair & {
  id: string | null
  challenge: string
  evidence: string[]
  alternativeExplanation: string
  requestedObservable: string
  falsifier: string
}

export type CouncilRebuttal = {
  challengeId: string | null
  role: CouncilRole
  response: string
  disposition: 'defend' | 'revise' | 'concede'
  revisedClaim: string
  verificationRequest: string
}

export type CouncilChallengeRound = {
  challenges: CouncilChallenge[]
  rebuttals: CouncilRebuttal[]
  advisory: string
}

type Candidate = {
  role: CouncilRole
  claimIndex: number
  priority: number
}

function safeText(value: unknown, max = 1200): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function clampPairCount(value: unknown): number {
  const numeric = Math.floor(Number(value))
  if (!Number.isFinite(numeric)) return 1
  return Math.max(1, Math.min(2, numeric))
}

function allowedEvidenceLabels(prompt: string): Set<string> {
  return new Set([...String(prompt ?? '').matchAll(/\[(KG|CL|OEM|EM|SK)\d{1,2}\]/g)].map(match => match[0]))
}

function claimPriority(opinion: CouncilOpinion, claimIndex: number): number {
  const claim = opinion.claims[claimIndex]
  if (!claim) return -1
  return (
    (claim.evidence.length ? 0 : 4) +
    Math.min(3, claim.assumptions.length) * 1.5 +
    (claim.observable ? 0 : 1) +
    (claim.falsifier ? 0 : 2) +
    Math.max(0, Math.min(1, Number(opinion.confidence) || 0)) * 0.25
  )
}

function bestClaim(opinion: CouncilOpinion): Candidate | null {
  if (!opinion.claims.length) return null
  let best: Candidate | null = null
  opinion.claims.forEach((_, claimIndex) => {
    const candidate = { role: opinion.role, claimIndex, priority: claimPriority(opinion, claimIndex) }
    if (!best || candidate.priority > best.priority || (candidate.priority === best.priority && candidate.claimIndex < best.claimIndex)) {
      best = candidate
    }
  })
  return best
}

/**
 * Deterministically chooses a tiny challenge set after independent first opinions exist.
 * Priority goes to claims with assumptions and weak supplied evidence, not to a majority vote.
 */
export function selectCouncilChallengePairs(opinions: CouncilOpinion[], maxPairs = 1): CouncilChallengePair[] {
  const boundedMax = clampPairCount(maxPairs)
  const nonSkeptic = opinions.filter(opinion => opinion.role !== 'skeptic' && opinion.claims.length > 0)
  const skeptic = opinions.find(opinion => opinion.role === 'skeptic' && opinion.claims.length > 0) ?? null
  const candidates = nonSkeptic
    .map(bestClaim)
    .filter((candidate): candidate is Candidate => Boolean(candidate))
    .sort((left, right) => right.priority - left.priority || left.role.localeCompare(right.role) || left.claimIndex - right.claimIndex)

  const pairs: CouncilChallengePair[] = []
  if (skeptic && candidates[0]) {
    pairs.push({
      challengerRole: 'skeptic',
      targetRole: candidates[0].role,
      targetClaimIndex: candidates[0].claimIndex,
    })
  }

  if (pairs.length < boundedMax && nonSkeptic.length >= 2) {
    const challengers = [...nonSkeptic].sort((left, right) =>
      (Number(right.credibilityWeight) || 1) - (Number(left.credibilityWeight) || 1) || left.role.localeCompare(right.role),
    )
    for (const challenger of challengers) {
      const target = candidates.find(candidate =>
        candidate.role !== challenger.role &&
        !pairs.some(pair => pair.challengerRole === challenger.role && pair.targetRole === candidate.role && pair.targetClaimIndex === candidate.claimIndex),
      )
      if (!target) continue
      pairs.push({
        challengerRole: challenger.role,
        targetRole: target.role,
        targetClaimIndex: target.claimIndex,
      })
      break
    }
  }

  return pairs.slice(0, boundedMax)
}

export function councilChallengePairBudget(council: CouncilAdvisory): number {
  if (council.trigger.highConsequence) return 2
  if (council.trigger.region === 'conflicted') return 2
  if (council.trigger.repeatedGapCount >= 2) return 2
  return clampPairCount(process.env.COS_COUNCIL_CHALLENGE_MAX_PAIRS || '1')
}

function opinionSummary(opinion: CouncilOpinion): string {
  const claims = opinion.claims.map((claim, index) => [
    `Claim ${index + 1}: ${claim.claim}`,
    `Evidence: ${claim.evidence.join(', ') || 'none supplied'}`,
    `Assumptions: ${claim.assumptions.join('; ') || 'none stated'}`,
    `Observable: ${claim.observable || 'none supplied'}`,
    `Falsifier: ${claim.falsifier || 'none supplied'}`,
  ].join('\n')).join('\n')
  return `${opinion.role.toUpperCase()} conclusion: ${opinion.conclusion}\n${claims}`
}

function challengePrompt(input: {
  challenger: CouncilOpinion
  target: CouncilOpinion
  targetClaimIndex: number
  governedPrompt: string
  allowedLabels: Set<string>
}): string {
  const targetClaim = input.target.claims[input.targetClaimIndex]
  return [
    `You are the ${input.challenger.role} member in the CHALLENGE round of SignalBoost COS Council.`,
    'The independent first-opinion phase is complete. You may now inspect the target claim.',
    'Do not provide hidden chain-of-thought. Return only a concise challenge artifact.',
    'Challenge evidence, assumptions, mechanism or falsifiability. Do not challenge merely to be contrarian.',
    'Use only evidence labels supplied in the governed context. Council opinions are not factual evidence.',
    'Do not invent telemetry, tool output or source material.',
    '',
    `Allowed evidence labels: ${[...input.allowedLabels].join(', ') || 'none'}`,
    `Target role: ${input.target.role}`,
    `Target claim number: ${input.targetClaimIndex + 1}`,
    `Target claim: ${targetClaim?.claim || ''}`,
    `Target evidence: ${targetClaim?.evidence.join(', ') || 'none supplied'}`,
    `Target assumptions: ${targetClaim?.assumptions.join('; ') || 'none stated'}`,
    `Target observable: ${targetClaim?.observable || 'none supplied'}`,
    `Target falsifier: ${targetClaim?.falsifier || 'none supplied'}`,
    '',
    'Return ONLY strict JSON:',
    '{"challenge":"...","evidence":["[KG1]"],"alternative_explanation":"...","requested_observable":"...","falsifier":"..."}',
    '',
    'GOVERNED COS CONTEXT:',
    input.governedPrompt.slice(0, 26000),
  ].join('\n')
}

function parseJsonObject(raw: string): any | null {
  const cleaned = String(raw ?? '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '')
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try { return JSON.parse(cleaned.slice(start, end + 1)) } catch { return null }
}

function parseChallenge(
  raw: string,
  pair: CouncilChallengePair,
  allowedLabels: Set<string>,
): Omit<CouncilChallenge, 'id'> | null {
  const parsed = parseJsonObject(raw)
  if (!parsed) return null
  const challenge = safeText(parsed.challenge, 1200)
  if (!challenge) return null
  return {
    ...pair,
    challenge,
    evidence: Array.isArray(parsed.evidence)
      ? parsed.evidence.map((item: unknown) => safeText(item, 40)).filter((item: string) => allowedLabels.has(item)).slice(0, 8)
      : [],
    alternativeExplanation: safeText(parsed.alternative_explanation, 900),
    requestedObservable: safeText(parsed.requested_observable, 700),
    falsifier: safeText(parsed.falsifier, 700),
  }
}

function rebuttalPrompt(input: {
  target: CouncilOpinion
  targetClaimIndex: number
  challenge: CouncilChallenge
  governedPrompt: string
}): string {
  const targetClaim = input.target.claims[input.targetClaimIndex]
  return [
    `You are the ${input.target.role} member in the REBUTTAL round of SignalBoost COS Council.`,
    'You are responding to one explicit challenge to your independent first opinion.',
    'Do not provide hidden chain-of-thought. Return only the requested structured rebuttal artifact.',
    'You may defend, revise, or concede the claim. Do not protect your prior answer for consistency or status.',
    'If the challenge exposes uncertainty, request the exact observable that would resolve it.',
    'Council statements remain advisory and are not factual evidence.',
    '',
    `Original claim: ${targetClaim?.claim || ''}`,
    `Original evidence: ${targetClaim?.evidence.join(', ') || 'none supplied'}`,
    `Challenge: ${input.challenge.challenge}`,
    `Challenger alternative: ${input.challenge.alternativeExplanation || 'none'}`,
    `Requested observable: ${input.challenge.requestedObservable || 'none'}`,
    '',
    'Return ONLY strict JSON:',
    '{"response":"...","disposition":"defend|revise|concede","revised_claim":"...","verification_request":"..."}',
    '',
    'GOVERNED COS CONTEXT:',
    input.governedPrompt.slice(0, 24000),
  ].join('\n')
}

function parseRebuttal(raw: string, challenge: CouncilChallenge): CouncilRebuttal | null {
  const parsed = parseJsonObject(raw)
  if (!parsed) return null
  const response = safeText(parsed.response, 1200)
  const dispositionRaw = safeText(parsed.disposition, 40).toLowerCase()
  const disposition = dispositionRaw === 'revise' || dispositionRaw === 'concede' ? dispositionRaw : dispositionRaw === 'defend' ? 'defend' : null
  if (!response || !disposition) return null
  return {
    challengeId: challenge.id,
    role: challenge.targetRole,
    response,
    disposition,
    revisedClaim: safeText(parsed.revised_claim, 1000),
    verificationRequest: safeText(parsed.verification_request, 700),
  }
}

async function persistChallenge(
  sessionId: string,
  challenge: Omit<CouncilChallenge, 'id'>,
  reasonerLabel: string,
): Promise<string | null> {
  const db = cosServiceDb()
  if (!db) return null
  try {
    const result = await db.from('cos_council_challenges').insert({
      session_id: sessionId,
      challenger_role: challenge.challengerRole,
      target_role: challenge.targetRole,
      target_claim_index: challenge.targetClaimIndex,
      challenge_text: challenge.challenge,
      evidence_labels: challenge.evidence,
      alternative_explanation: challenge.alternativeExplanation || null,
      requested_observable: challenge.requestedObservable || null,
      falsifier: challenge.falsifier || null,
      reasoner_label: reasonerLabel,
    }).select('id').maybeSingle()
    return result.error ? null : String(result.data?.id || '') || null
  } catch {
    return null
  }
}

async function persistRebuttal(sessionId: string, rebuttal: CouncilRebuttal, reasonerLabel: string): Promise<void> {
  if (!rebuttal.challengeId) return
  const db = cosServiceDb()
  if (!db) return
  try {
    await db.from('cos_council_rebuttals').insert({
      challenge_id: rebuttal.challengeId,
      session_id: sessionId,
      role: rebuttal.role,
      response_text: rebuttal.response,
      disposition: rebuttal.disposition,
      revised_claim: rebuttal.revisedClaim || null,
      verification_request: rebuttal.verificationRequest || null,
      reasoner_label: reasonerLabel,
    })
  } catch {}
}

async function markChallengeRound(sessionId: string, challengeCount: number): Promise<void> {
  const db = cosServiceDb()
  if (!db) return
  try {
    await db.from('cos_council_sessions').update({
      challenge_count: challengeCount,
      challenge_round_completed_at: new Date().toISOString(),
    }).eq('id', sessionId)
  } catch {}
}

function challengeRoundAdvisory(round: Omit<CouncilChallengeRound, 'advisory'>): string {
  const rebuttalsByChallenge = new Map<string, CouncilRebuttal>()
  for (const rebuttal of round.rebuttals) {
    if (rebuttal.challengeId) rebuttalsByChallenge.set(rebuttal.challengeId, rebuttal)
  }

  const artifacts = round.challenges.map((challenge, index) => {
    const rebuttal = challenge.id ? rebuttalsByChallenge.get(challenge.id) : round.rebuttals[index]
    return [
      `Challenge ${index + 1}: ${challenge.challengerRole.toUpperCase()} → ${challenge.targetRole.toUpperCase()} claim ${challenge.targetClaimIndex + 1}`,
      `Challenge: ${challenge.challenge}`,
      `Evidence labels: ${challenge.evidence.join(', ') || 'none supplied'}`,
      `Alternative explanation: ${challenge.alternativeExplanation || 'none supplied'}`,
      `Requested observable: ${challenge.requestedObservable || 'none supplied'}`,
      `Challenge falsifier: ${challenge.falsifier || 'none supplied'}`,
      rebuttal ? `Rebuttal (${rebuttal.disposition}): ${rebuttal.response}` : 'Rebuttal: unavailable',
      rebuttal?.revisedClaim ? `Revised claim: ${rebuttal.revisedClaim}` : '',
      rebuttal?.verificationRequest ? `Verification request: ${rebuttal.verificationRequest}` : '',
    ].filter(Boolean).join('\n')
  }).join('\n\n')

  return [
    'COGNITIVE COUNCIL CHALLENGE ROUND — ADVISORY, NOT NEW FACTUAL EVIDENCE',
    artifacts,
    '',
    'JUDGE RULES AFTER CHALLENGE:',
    '- Treat defend/revise/concede as argument state, not truth.',
    '- Prefer supplied deterministic/tool evidence and exact observables over Council agreement.',
    '- A conceded claim may be dropped, but a defended claim is not promoted merely because it survived challenge.',
    '- If a requested observable is unavailable, preserve that unresolved uncertainty in the final answer.',
    '- Never cite a Council challenge or rebuttal as a factual source.',
  ].join('\n')
}

/**
 * Run one bounded post-independence challenge/rebuttal round. This function never executes tools,
 * never receives customer credentials and never changes answer confidence. It only supplies an
 * adversarial review artifact to the existing primary COS judge.
 */
export async function runCouncilChallengeRound(input: {
  council: CouncilAdvisory
  governedPrompt: string
  reasonerLabel: string
}): Promise<CouncilChallengeRound | null> {
  if (process.env.COS_COUNCIL_CHALLENGE_ENABLED === 'false') return null
  if (!input.council.sessionId || input.council.opinions.length < 2) return null

  const pairBudget = councilChallengePairBudget(input.council)
  const pairs = selectCouncilChallengePairs(input.council.opinions, pairBudget)
  if (!pairs.length) return null

  const inference = localInferenceConfigFromEnv()
  const allowedLabels = allowedEvidenceLabels(input.governedPrompt)
  const opinionByRole = new Map(input.council.opinions.map(opinion => [opinion.role, opinion]))
  const challenges: CouncilChallenge[] = []
  const rebuttals: CouncilRebuttal[] = []
  await touchRunpodActivityLease('cognitive_council_challenge')

  for (const pair of pairs) {
    const challenger = opinionByRole.get(pair.challengerRole)
    const target = opinionByRole.get(pair.targetRole)
    if (!challenger || !target || !target.claims[pair.targetClaimIndex]) continue

    const rawChallenge = await callLocalModel({
      temperature: 0,
      maxTokens: Number(process.env.COS_COUNCIL_CHALLENGE_MAX_TOKENS || '900'),
      systemPrompt: 'You are a bounded adversarial reviewer inside SignalBoost COS Council. Return only the requested challenge artifact.',
      prompt: challengePrompt({ challenger, target, targetClaimIndex: pair.targetClaimIndex, governedPrompt: input.governedPrompt, allowedLabels }),
    }, inference).catch(() => null)
    if (!rawChallenge) continue

    const parsedChallenge = parseChallenge(rawChallenge, pair, allowedLabels)
    if (!parsedChallenge) continue
    const id = await persistChallenge(input.council.sessionId, parsedChallenge, input.reasonerLabel)
    const challenge: CouncilChallenge = { ...parsedChallenge, id }
    challenges.push(challenge)

    const rawRebuttal = await callLocalModel({
      temperature: 0,
      maxTokens: Number(process.env.COS_COUNCIL_REBUTTAL_MAX_TOKENS || '900'),
      systemPrompt: 'You are a bounded Council member responding to a specific challenge. Return only the requested rebuttal artifact.',
      prompt: rebuttalPrompt({ target, targetClaimIndex: pair.targetClaimIndex, challenge, governedPrompt: input.governedPrompt }),
    }, inference).catch(() => null)
    if (!rawRebuttal) continue

    const rebuttal = parseRebuttal(rawRebuttal, challenge)
    if (!rebuttal) continue
    rebuttals.push(rebuttal)
    await persistRebuttal(input.council.sessionId, rebuttal, input.reasonerLabel)
  }

  await markChallengeRound(input.council.sessionId, challenges.length)
  if (!challenges.length) return null

  const partial = { challenges, rebuttals }
  return { ...partial, advisory: challengeRoundAdvisory(partial) }
}
