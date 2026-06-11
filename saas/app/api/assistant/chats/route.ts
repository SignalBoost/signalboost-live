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

function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
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
  if (!userId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const db = supabaseAdmin()
  const id = req.nextUrl.searchParams.get('id')

  if (id) {
    const { data: conv } = await db
      .from('assistant_conversations')
      .select('id, title, summary, message_count, created_at, updated_at')
      .eq('id', id)
      .eq('user_id', userId)
      .maybeSingle()
    if (!conv) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    }

    const { data: messages, error } = await db
      .from('assistant_messages')
      .select('role, content, created_at')
      .eq('conversation_id', id)
      .eq('user_id', userId)
      .order('created_at', { ascending: true })
    if (error) {
      return NextResponse.json({ error: 'Could not load messages' }, { status: 500 })
    }

    return NextResponse.json({ conversation: conv, messages: messages ?? [] })
  }

  const { data: conversations, error } = await db
    .from('assistant_conversations')
    .select('id, title, summary, message_count, created_at, updated_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(100)
  if (error) {
    return NextResponse.json({ error: 'Could not load conversations' }, { status: 500 })
  }

  return NextResponse.json({ conversations: conversations ?? [] })
}

export async function DELETE(req: NextRequest) {
  const userId = await authedUserId()
  if (!userId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const db = supabaseAdmin()
  const params = req.nextUrl.searchParams

  if (params.get('all') === 'true') {
    const { data, error } = await db
      .from('assistant_conversations')
      .delete()
      .eq('user_id', userId)
      .select('id')
    if (error) {
      return NextResponse.json({ error: 'Delete failed' }, { status: 500 })
    }
    return NextResponse.json({ deleted: 'all', count: data?.length ?? 0 })
  }

  const id = params.get('id')
  if (!id) {
    return NextResponse.json({ error: 'Provide id or all=true' }, { status: 400 })
  }

  const { error } = await db
    .from('assistant_conversations')
    .delete()
    .eq('id', id)
    .eq('user_id', userId)
  if (error) {
    return NextResponse.json({ error: 'Delete failed' }, { status: 500 })
  }
  return NextResponse.json({ deleted: id })
}
