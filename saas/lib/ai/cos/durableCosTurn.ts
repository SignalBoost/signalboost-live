// saas/lib/ai/cos/durableCosTurn.ts
import { createClient } from '@supabase/supabase-js'
import { provenanceWithDeliveredVisual } from '../../concierge/deliveredVisual.ts'

export const COS_TURN_SCHEMA = 'signalboost-cos-turn-v1'
export const COS_TURN_STALE_AFTER_MS = 6 * 60 * 1000

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || ''
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

export async function enqueueDurableCosTurn(input: {
  turnId: string
  userId: string
  conversationId: string
  prompt: string
  runningReply: string
}): Promise<{ historyMessageId: string; admittedNew: boolean }> {
  if (![input.turnId, input.userId, input.conversationId].every(value => UUID.test(value))) {
    throw new Error('cos_turn_invalid_identity')
  }
  const prompt = String(input.prompt || '').trim()
  if (!prompt) throw new Error('cos_turn_prompt_required')
  const db = serviceClient()
  if (!db) throw new Error('cos_turn_storage_unavailable')

  // A single database transaction creates the canonical task and both History rows.
  // The browser-provided task ID is stable across retries; the RPC rejects owner or
  // objective changes and returns the existing receipt without replaying execution.
  const { data: admitted, error } = await db.rpc('admit_cos_customer_task_once', {
    p_task_id: input.turnId,
    p_user_id: input.userId,
    p_conversation_id: input.conversationId,
    p_objective: prompt,
    p_running_reply: input.runningReply,
  })
  if (error) throw new Error(`cos_task_admission: ${error.message}`)
  const historyMessageId = String(admitted?.historyMessageId || '')
  if (!UUID.test(historyMessageId)) throw new Error('cos_task_admission_receipt_missing')
  if (typeof admitted?.admittedNew !== 'boolean') throw new Error('cos_task_admission_kind_missing')
  return { historyMessageId, admittedNew: admitted.admittedNew }
}

export async function finishDurableCosTurn(input: {
  turnId: string
  historyMessageId: string
  userId: string
  status: 'succeeded' | 'failed'
  reply: string
  source?: string | null
  executionProvenance?: unknown
  answerProvenance?: unknown
  /** A chart or image delivered with the answer; History shows it with the stored reply. */
  deliveredVisual?: unknown
  error?: string | null
}): Promise<void> {
  if (![input.turnId, input.historyMessageId, input.userId].every(value => UUID.test(value))) {
    throw new Error('cos_turn_invalid_identity')
  }
  const db = serviceClient()
  if (!db) throw new Error('cos_turn_storage_unavailable')
  const provenance = cosTurnHistoryProvenance(input)
  // One PostgreSQL transaction owns both terminal writes. Never allow History
  // to claim completion while the canonical customer task remains running.
  const { data: committed, error } = await db.rpc('finish_cos_customer_task', {
    p_task_id: input.turnId,
    p_history_message_id: input.historyMessageId,
    p_user_id: input.userId,
    p_status: input.status,
    p_reply: String(input.reply || '').trim(),
    p_provenance: provenance,
    p_error: input.error || null,
  })
  if (error) throw new Error(`cos_task_finish: ${error.message}`)
  if (committed !== true) throw new Error('cos_task_finish_not_committed')
}

export async function expireStaleDurableCosTurns(input: {
  userId: string
  conversationId?: string | null
}): Promise<number> {
  if (!UUID.test(input.userId)) return 0
  if (input.conversationId && !UUID.test(input.conversationId)) return 0
  const db = serviceClient()
  if (!db) return 0
  const cutoff = new Date(Date.now() - COS_TURN_STALE_AFTER_MS).toISOString()
  let query = db.from('assistant_messages')
    .select('id,provenance')
    .eq('user_id', input.userId)
    .eq('role', 'assistant')
    .eq('provenance->>schema', COS_TURN_SCHEMA)
    .eq('provenance->>status', 'running')
    .lt('created_at', cutoff)
    .limit(20)
  if (input.conversationId) query = query.eq('conversation_id', input.conversationId)
  const { data, error } = await query
  if (error || !data?.length) return 0

  let expired = 0
  for (const row of data) {
    const turnId = String((row.provenance as any)?.turnId || '')
    if (!UUID.test(turnId)) continue
    const provenance = {
      ...(row.provenance as Record<string, unknown>),
      status: 'failed',
      error: 'worker_lost',
      finishedAt: new Date().toISOString(),
    }
    // The same fenced transaction owns stale failure and normal completion.
    // Do not terminalize History alone or overwrite a concurrently finished turn.
    try {
      const { data: committed, error: finishError } = await db.rpc('finish_cos_customer_task', {
        p_task_id: turnId,
        p_history_message_id: row.id,
        p_user_id: input.userId,
        p_status: 'failed',
        p_reply: 'COS could not finish this turn because its background worker stopped before producing a verified response. The turn was not replayed.',
        p_provenance: provenance,
        p_error: 'worker_lost',
      })
      if (finishError) throw finishError
      if (committed === true) expired += 1
    } catch (error) {
      // A concurrent normal completion can win the task lock. Never overwrite
      // its terminal result; leave unresolved records for controlled recovery.
      console.warn('[cos_stale_task_atomic_finish_failed]', {
        turnId, message: error instanceof Error ? error.message : 'unknown',
      })
    }
  }
  return expired
}

/** Scan expired running History rows across tenants; finish through the existing
 * generation-fenced customer-task RPC. Completed records are never overwritten. */
export async function expireStaleDurableCosTurnsSystemWide(): Promise<number> {
  const db = serviceClient()
  if (!db) throw new Error('cos_turn_storage_unavailable')
  const cutoff = new Date(Date.now() - COS_TURN_STALE_AFTER_MS).toISOString()
  const { data, error } = await db.from('assistant_messages')
    .select('user_id')
    .eq('role', 'assistant')
    .eq('provenance->>schema', COS_TURN_SCHEMA)
    .eq('provenance->>status', 'running')
    .lt('created_at', cutoff)
    .order('created_at', { ascending: true })
    .limit(100)
  if (error) throw new Error(`cos_stale_scan: ${error.message}`)
  let expired = 0
  for (const userId of new Set((data ?? []).map(row => String(row.user_id)).filter(value => UUID.test(value)))) {
    expired += await expireStaleDurableCosTurns({ userId })
  }
  return expired
}

function plainRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

/**
 * The stored History provenance of a finished customer task. The execution provenance stays at the top level, where
 * every History reader looks for it (delivered charts, explain-your-answer, feedback, owner outcomes). The task's own
 * fields win: `turnId` is the customer task id (the builder_jobs row); the reasoner's turn id, which keys
 * cos_turn_experience and cos_turn_outcomes, is kept as `cosTurnId`.
 */
export function cosTurnHistoryProvenance(input: {
  turnId: string
  status: 'succeeded' | 'failed'
  source?: string | null
  executionProvenance?: unknown
  answerProvenance?: unknown
  deliveredVisual?: unknown
  error?: string | null
}): Record<string, unknown> {
  const execution = plainRecord(input.executionProvenance) ?? {}
  const { schema: _schema, turnId: reasonerTurnId, status: _status, ...executionFields } = execution
  const withVisual = plainRecord(provenanceWithDeliveredVisual(executionFields, input.deliveredVisual)) ?? executionFields
  const cosTurnId = typeof reasonerTurnId === 'string' && reasonerTurnId.trim() ? reasonerTurnId.trim() : null
  return {
    ...withVisual,
    ...(cosTurnId ? { cosTurnId } : {}),
    schema: COS_TURN_SCHEMA,
    turnId: input.turnId,
    status: input.status,
    finishedAt: new Date().toISOString(),
    source: input.source || null,
    error: input.error || null,
    answer_provenance: input.answerProvenance ?? null,
  }
}

/** The reasoner turn id of a stored assistant message: `cosTurnId` on a customer-task row, otherwise `turnId`. */
export function historyCosTurnId(provenance: unknown): string {
  const recorded = plainRecord(provenance)
  if (!recorded) return ''
  const value = recorded.schema === COS_TURN_SCHEMA ? recorded.cosTurnId : recorded.turnId
  return typeof value === 'string' ? value.trim() : ''
}

export type AdmittedCosTurnOutcome = Readonly<{
  status: 'succeeded' | 'failed'
  reply: string
  source: string | null
  executionProvenance: unknown
  answerProvenance: unknown
  deliveredVisual: unknown
  error: string | null
}>

/**
 * Runs one request-path COS turn as a customer task. The task record (builder_jobs `cos_turn` + its History rows) is
 * admitted before the turn runs, so the request exists even if the process dies mid-turn; it is then finished with the
 * delivered answer, or failed when the turn throws or delivers nothing. Admission failure never withholds the answer
 * (a read-only turn is safe to answer): the exchange is stored without a task record and the failure is logged.
 */
export async function runAdmittedCosTurn<T>(ports: {
  admit: () => Promise<{ historyMessageId: string }>
  run: () => Promise<T>
  outcome: (result: T) => Promise<AdmittedCosTurnOutcome | null>
  finish: (input: AdmittedCosTurnOutcome & { historyMessageId: string }) => Promise<void>
  storeWithoutTask: (outcome: AdmittedCosTurnOutcome) => Promise<void>
  afterStored?: () => Promise<void>
  failedReply: string
}): Promise<T> {
  let historyMessageId: string | null = null
  try {
    historyMessageId = (await ports.admit()).historyMessageId
  } catch (error) {
    console.error('[cos_task_admission_failed]', JSON.stringify({ message: error instanceof Error ? error.message : 'unknown' }))
  }
  const failed = (error: string): AdmittedCosTurnOutcome => ({
    status: 'failed', reply: ports.failedReply, source: 'cos-turn-failed', executionProvenance: null,
    answerProvenance: null, deliveredVisual: null, error,
  })
  const record = async (outcome: AdmittedCosTurnOutcome | null) => {
    try {
      if (historyMessageId) await ports.finish({ ...(outcome ?? failed('cos_turn_no_reply')), historyMessageId })
      else if (outcome) await ports.storeWithoutTask(outcome)
      else return
      await ports.afterStored?.()
    } catch (error) {
      // The answer is already produced; a storage fault (or a replay whose task another attempt finished) is logged,
      // never shown as a failed answer.
      console.error('[cos_task_finish_failed]', JSON.stringify({ message: error instanceof Error ? error.message : 'unknown' }))
    }
  }
  let result: T
  try {
    result = await ports.run()
  } catch (error) {
    await record(historyMessageId ? failed(error instanceof Error ? error.message : 'cos_turn_failed') : null)
    throw error
  }
  await record(await ports.outcome(result))
  return result
}
