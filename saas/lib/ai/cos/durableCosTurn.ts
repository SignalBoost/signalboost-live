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

  const { data: existing, error: readError } = await db.from('assistant_conversations')
    .select('id,user_id,message_count').eq('id', input.conversationId).maybeSingle()
  if (readError) throw new Error(`cos_turn_conversation_read: ${readError.message}`)
  if (existing && existing.user_id !== input.userId) throw new Error('cos_turn_conversation_ownership_mismatch')
  if (!existing) {
    const { error } = await db.from('assistant_conversations').insert({
      id: input.conversationId,
      user_id: input.userId,
      title: prompt.slice(0, 80),
      message_count: 0,
    })
    if (error) throw new Error(`cos_turn_conversation_create: ${error.message}`)
  }

  const startedAt = new Date().toISOString()
  const runningProvenance = {
    schema: COS_TURN_SCHEMA,
    turnId: input.turnId,
    status: 'running',
    startedAt,
  }
  const { data: rows, error: insertError } = await db.from('assistant_messages').insert([
    {
      conversation_id: input.conversationId,
      user_id: input.userId,
      role: 'user',
      content: prompt.slice(0, 16_000),
    },
    {
      conversation_id: input.conversationId,
      user_id: input.userId,
      role: 'assistant',
      content: String(input.runningReply || '').trim().slice(0, 4_000),
      provenance: runningProvenance,
    },
  ]).select('id,role')
  if (insertError) throw new Error(`cos_turn_message_create: ${insertError.message}`)
  const historyMessageId = String(rows?.find((row: any) => row.role === 'assistant')?.id || '')
  if (!UUID.test(historyMessageId)) throw new Error('cos_turn_history_message_missing')

  const nextCount = Number(existing?.message_count || 0) + 2
  const { error: bumpError } = await db.from('assistant_conversations')
    .update({ message_count: nextCount, updated_at: startedAt })
    .eq('id', input.conversationId).eq('user_id', input.userId)
  if (bumpError) console.error('[cos_turn_conversation_bump_failed]', { turnId: input.turnId, message: bumpError.message })

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
  const { error } = await db.from('assistant_messages')
    .update({
      content: String(input.reply || '').trim().slice(0, 16_000),
      provenance,
    })
    .eq('id', input.historyMessageId)
    .eq('user_id', input.userId)
    .eq('role', 'assistant')
    .eq('provenance->>schema', COS_TURN_SCHEMA)
    .eq('provenance->>turnId', input.turnId)
    .eq('provenance->>status', 'running')
  if (error) throw new Error(`cos_turn_finish: ${error.message}`)
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
    const { data: updated } = await db.from('assistant_messages')
      .update({
        content: 'COS could not finish this turn because its background worker stopped before producing a verified response. The turn was not replayed.',
        provenance,
      })
      .eq('id', row.id)
      .eq('user_id', input.userId)
      .eq('provenance->>status', 'running')
      .select('id')
      .maybeSingle()
    if (updated?.id) expired += 1
  }
  return expired
}
