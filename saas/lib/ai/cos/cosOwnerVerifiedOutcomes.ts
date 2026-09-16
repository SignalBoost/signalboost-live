import { createHash } from 'node:crypto'
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import { recordVerifiedCosProductionOutcome } from '@/lib/ai/cos/cognitiveVerifiedOutcome'
import {
  COS_OWNER_VERIFIED_OUTCOME_MAX_AGE_DAYS,
  COS_OWNER_VERIFIED_SUBJECTS_PROFILE,
  decideOwnerVerifiedOutcome,
  subjectsForVerifiedRequest,
  type OwnerVerifiedOutcomeRequest,
} from '@/lib/ai/cos/cosOwnerVerifiedOutcomePolicy'

const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const clean = (value: unknown, max: number) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)

function db() {
  const client = cosServiceDb()
  if (!client) throw new Error('service_database_unavailable')
  return client
}

type OwnerTurn = { turnId: string; answeredAt: string; userPrompt: string; reply: string }

/** The owner's own COS replies in the verification window, each paired with the request it answered. */
async function ownerTurns(userId: string, now: Date): Promise<OwnerTurn[]> {
  const since = new Date(now.getTime() - COS_OWNER_VERIFIED_OUTCOME_MAX_AGE_DAYS * 86_400_000).toISOString()
  const rows = await db().from('assistant_messages')
    .select('conversation_id,role,content,created_at,provenance')
    .eq('user_id', userId)
    .gte('created_at', since)
    .order('created_at', { ascending: true })
    .limit(2000)
  if (rows.error) throw rows.error
  const lastPrompt = new Map<string, string>()
  const turns: OwnerTurn[] = []
  for (const row of (rows.data || []) as any[]) {
    const conversation = String(row.conversation_id || '')
    if (row.role === 'user') { lastPrompt.set(conversation, String(row.content || '')); continue }
    if (row.role !== 'assistant') continue
    const turnId = clean(row?.provenance?.turnId, 80)
    const userPrompt = lastPrompt.get(conversation) || ''
    if (!turnId || !userPrompt.trim()) continue
    turns.push({ turnId, answeredAt: String(row.created_at || ''), userPrompt, reply: String(row.content || '') })
  }
  return turns
}

async function verifiedTurnIds(turnIds: string[]): Promise<Set<string>> {
  if (!turnIds.length) return new Set()
  const rows = await db().from('cos_turn_outcomes')
    .select('turn_id,outcome_source')
    .in('turn_id', turnIds.slice(0, 500))
    .like('outcome_source', 'production_verified:%')
  if (rows.error) throw rows.error
  return new Set((rows.data || []).map((row: any) => String(row.turn_id)))
}

export async function listOwnerVerifiableTurns(userId: string, now = new Date()) {
  const turns = (await ownerTurns(userId, now)).reverse().slice(0, 60)
  const verified = await verifiedTurnIds(turns.map(turn => turn.turnId))
  return turns.map(turn => ({
    turnId: turn.turnId,
    answeredAt: turn.answeredAt,
    requestExcerpt: clean(turn.userPrompt, 280),
    replyExcerpt: clean(turn.reply, 280),
    subjects: subjectsForVerifiedRequest(turn.userPrompt),
    verified: verified.has(turn.turnId),
  }))
}

export async function recordOwnerVerifiedTurnOutcome(input: {
  userId: string
  request: Partial<OwnerVerifiedOutcomeRequest>
  now?: Date
}) {
  const now = input.now || new Date()
  const turnId = clean(input.request.turnId, 80)
  const turn = (await ownerTurns(input.userId, now)).find(item => item.turnId === turnId) || null
  const already = turn ? (await verifiedTurnIds([turn.turnId])).has(turn.turnId) : false
  const decision = decideOwnerVerifiedOutcome({
    request: input.request,
    turn: turn ? { exists: true, userPrompt: turn.userPrompt, answeredAt: turn.answeredAt } : null,
    alreadyVerified: already,
    now,
  })
  if (!decision.ok) return decision

  // 1. Durable subject record first. Append-only and keyed by turn, so a turn is verified once.
  const subjectEvidence = {
    profile: COS_OWNER_VERIFIED_SUBJECTS_PROFILE,
    turnId: decision.turnId,
    subjects: decision.subjects,
    subjectBasis: 'user_request_text',
    requestHash: hash(turn!.userPrompt),
    outcome: decision.outcome,
    evidenceRef: decision.evidenceRef,
    verifiedBy: 'owner',
    ownerUserId: input.userId,
    authorityExpanded: false,
  }
  const ledger = await db().from('cos_university_learning_assurance_events').insert({
    event_key: hash([COS_OWNER_VERIFIED_SUBJECTS_PROFILE, decision.turnId]),
    event_type: 'learning_outcome',
    subject_id: decision.subjects[0],
    evidence_hash: hash(subjectEvidence),
    evidence: subjectEvidence,
    verifier: 'host_controller',
    observed_at: now.toISOString(),
  })
  if (ledger.error) {
    if (String((ledger.error as any)?.code || '') === '23505') return { ok: false as const, error: 'turn_outcome_already_verified' }
    throw ledger.error
  }

  // 2. The single governed verified-outcome writer, correlated to the exact server-owned COS turn.
  await recordVerifiedCosProductionOutcome({
    sourceClass: 'authoritative_record',
    sourceRef: `owner_verified_record:${decision.evidenceRef}`,
    domain: 'other',
    outcomeStatus: decision.outcome,
    summary: decision.summary,
    prompt: turn!.userPrompt,
    correlation: { kind: 'cos_turn_id', value: decision.turnId },
    idempotencyKey: `owner-verified-turn:${decision.turnId}`,
    occurredAt: now.toISOString(),
    facts: { verifiedBy: 'owner', evidenceRef: decision.evidenceRef, universitySubjects: decision.subjects },
    universityEvidence: null,
  })

  // 3. Report success only if the verified outcome is actually attached to the turn.
  const confirmed = (await verifiedTurnIds([decision.turnId])).has(decision.turnId)
  if (!confirmed) return { ok: false as const, error: 'verified_outcome_not_persisted' }
  return { ok: true as const, turnId: decision.turnId, outcome: decision.outcome, subjects: decision.subjects }
}
