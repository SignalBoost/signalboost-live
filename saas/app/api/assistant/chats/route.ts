// Conversation history endpoints for the AI assistant (Level 2 memory).
// Backed by assistant_conversations / assistant_messages — the same tables
// used by lib/ai/tools/conversationHistory.ts.
//
// GET    /api/assistant/chats           -> list this user's conversations
// GET    /api/assistant/chats?id=UUID   -> full transcript of one conversation
// DELETE /api/assistant/chats?id=UUID   -> delete one conversation
// DELETE /api/assistant/chats?all=true  -> delete all conversations for this user
// Auth: Supabase session cookie (same as the rest of the dashboard).

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getAccess } from '@/lib/auth/access'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function response(payload: unknown, init?: ResponseInit): NextResponse {
  const result = NextResponse.json(payload, init)
  result.headers.set('Cache-Control', 'no-store, max-age=0')
  return result
}

function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || ''
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  if (!url || !key) throw new Error('assistant_history_storage_unavailable')
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

async function authedUserId(): Promise<string | null> {
  try {
    const access = await getAccess()
    return access.userId
  } catch {
    return null
  }
}

export async function GET(req: NextRequest) {
  const userId = await authedUserId()
  if (!userId) return response({ error: 'Not authenticated' }, { status: 401 })

  try {
    const db = supabaseAdmin()
    const id = req.nextUrl.searchParams.get('id')

    if (id) {
      if (!UUID.test(id)) return response({ error: 'Invalid conversation id' }, { status: 400 })
      const { data: conv, error: conversationError } = await db
        .from('assistant_conversations')
        .select('id, title, summary, message_count, created_at, updated_at')
        .eq('id', id)
        .eq('user_id', userId)
        .maybeSingle()
      if (conversationError) {
        console.error('[assistant_history_conversation_read_failed]', { message: conversationError.message })
        return response({ error: 'Could not load conversation' }, { status: 500 })
      }
      if (!conv) {
        // Missing/stale thread IDs remain a truthful 200 empty transcript so New chat can recover.
        return response({ conversation: null, messages: [], missing: true })
      }

      const { data: messages, error: messagesError } = await db
        .from('assistant_messages')
        .select('id, role, content, created_at, message_order, provenance')
        .eq('conversation_id', id)
        .eq('user_id', userId)
        .order('message_order', { ascending: true })
      if (messagesError) {
        console.error('[assistant_history_message_read_failed]', { message: messagesError.message })
        return response({ error: 'Could not load messages' }, { status: 500 })
      }

      return response({ conversation: conv, messages: messages ?? [] })
    }

    const { data: conversations, error } = await db
      .from('assistant_conversations')
      .select('id, title, summary, message_count, created_at, updated_at')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(100)
    if (error) {
      console.error('[assistant_history_list_failed]', { message: error.message })
      return response({ error: 'Could not load conversations' }, { status: 500 })
    }

    return response({ conversations: conversations ?? [] })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'assistant_history_failed'
    console.error('[assistant_history_failed]', { message })
    return response({ error: 'Could not load history' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const userId = await authedUserId()
  if (!userId) return response({ error: 'Not authenticated' }, { status: 401 })

  try {
    const db = supabaseAdmin()
    const params = req.nextUrl.searchParams

    if (params.get('all') === 'true') {
      const { data, error } = await db
        .from('assistant_conversations')
        .delete()
        .eq('user_id', userId)
        .select('id')
      if (error) return response({ error: 'Delete failed' }, { status: 500 })
      return response({ deleted: 'all', count: data?.length ?? 0 })
    }

    const id = params.get('id')
    if (!id) return response({ error: 'Provide id or all=true' }, { status: 400 })
    if (!UUID.test(id)) return response({ error: 'Invalid conversation id' }, { status: 400 })

    const { error } = await db
      .from('assistant_conversations')
      .delete()
      .eq('id', id)
      .eq('user_id', userId)
    if (error) return response({ error: 'Delete failed' }, { status: 500 })
    return response({ deleted: id })
  } catch {
    return response({ error: 'Delete failed' }, { status: 500 })
  }
}
