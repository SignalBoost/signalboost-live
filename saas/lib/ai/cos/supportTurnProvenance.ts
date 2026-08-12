import { cosServiceDb } from '@/lib/cos-core/storage/supabase'

export type RecordedTurnProvenance = Record<string, unknown>

const MAX_STORED_CONTENT = 4000

function validId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
}

function normalize(value: unknown): RecordedTurnProvenance | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  try {
    const json = JSON.stringify(value)
    if (!json || json.length > 32_000) return null
    return JSON.parse(json) as RecordedTurnProvenance
  } catch {
    return null
  }
}

export async function latestRecordedTurnProvenance(
  conversationId: string,
  userId: string,
): Promise<RecordedTurnProvenance | null> {
  if (!validId(conversationId) || !userId) return null
  const db = cosServiceDb()
  if (!db) return null
  try {
    const { data, error } = await db
      .from('assistant_messages')
      .select('provenance')
      .eq('conversation_id', conversationId)
      .eq('user_id', userId)
      .eq('role', 'assistant')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) throw error
    return normalize(data?.provenance)
  } catch (error) {
    console.error('supportTurnProvenance: latest provenance read failed', error)
    return null
  }
}

/**
 * Exact-content fallback for clients that have not yet supplied a durable conversation UUID.
 * The request already contains the immediately preceding assistant turn; matching that
 * content and authenticated user is safer than a user-wide "latest answer" lookup and
 * prevents cross-tab/cross-conversation provenance mixups.
 */
export async function recordedTurnProvenanceByContent(
  userId: string,
  assistantContent: string,
): Promise<RecordedTurnProvenance | null> {
  if (!userId) return null
  const expected = assistantContent.trim().slice(0, MAX_STORED_CONTENT)
  if (!expected) return null
  const db = cosServiceDb()
  if (!db) return null
  try {
    const { data, error } = await db
      .from('assistant_messages')
      .select('provenance,content')
      .eq('user_id', userId)
      .eq('role', 'assistant')
      .eq('content', expected)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) throw error
    if (String(data?.content || '') !== expected) return null
    return normalize(data?.provenance)
  } catch (error) {
    console.error('supportTurnProvenance: content provenance read failed', error)
    return null
  }
}

export async function attachRecordedTurnProvenance(
  conversationId: string,
  userId: string,
  assistantReply: string,
  provenance: unknown,
): Promise<boolean> {
  if (!validId(conversationId) || !userId) return false
  const normalized = normalize(provenance)
  if (!normalized) return false
  const expectedContent = assistantReply.trim().slice(0, MAX_STORED_CONTENT)
  if (!expectedContent) return false
  const db = cosServiceDb()
  if (!db) return false
  try {
    const { data: row, error: readError } = await db
      .from('assistant_messages')
      .select('id,content')
      .eq('conversation_id', conversationId)
      .eq('user_id', userId)
      .eq('role', 'assistant')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (readError || !row?.id || String(row.content || '') !== expectedContent) return false

    const { error: updateError } = await db
      .from('assistant_messages')
      .update({ provenance: normalized })
      .eq('id', row.id)
      .eq('user_id', userId)
    if (updateError) throw updateError
    return true
  } catch (error) {
    console.error('supportTurnProvenance: provenance attach failed', error)
    return false
  }
}
