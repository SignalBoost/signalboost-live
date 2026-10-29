import { createClient } from '@supabase/supabase-js'

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
}): Promise<{ historyMessageId: string }> {
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
  const { data: admitted, error } = await db.rpc('admit_cos_customer_task', {
    p_task_id: input.turnId,
    p_user_id: input.userId,
    p_conversation_id: input.conversationId,
    p_objective: prompt,
    p_running_reply: input.runningReply,
  })
  if (error) throw new Error(`cos_task_admission: ${error.message}`)
  const historyMessageId = String(admitted || '')
  if (!UUID.test(historyMessageId)) throw new Error('cos_task_admission_receipt_missing')
  return { historyMessageId }
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
  error?: string | null
}): Promise<void> {
  if (![input.turnId, input.historyMessageId, input.userId].every(value => UUID.test(value))) {
    throw new Error('cos_turn_invalid_identity')
  }
  const db = serviceClient()
  if (!db) throw new Error('cos_turn_storage_unavailable')
  const provenance = {
    schema: COS_TURN_SCHEMA,
    turnId: input.turnId,
    status: input.status,
    finishedAt: new Date().toISOString(),
    source: input.source || null,
    error: input.error || null,
    execution_provenance: input.executionProvenance ?? null,
    answer_provenance: input.answerProvenance ?? null,
  }
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
