import { NextRequest, NextResponse } from 'next/server'
import { getAccess } from '@/lib/auth/access'
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import {
  recordCosUserFeedbackExperience,
  type CosUserFeedbackType,
} from '@/lib/ai/cos/cognitiveUserFeedback'
import { attachTurnOutcome } from '@/lib/ai/cos/turnExperienceStore'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_CONVERSATION_MESSAGES = 500
const MAX_ASSISTANT_CONTENT_CHARS = 80_000
const MAX_CORRECTION_CHARS = 4_000

type ConversationMessage = {
  role?: string | null
  content?: string | null
  created_at?: string | null
  provenance?: unknown
}

function clean(value: unknown, max: number): string {
  return String(value ?? '').trim().slice(0, max)
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function validFeedbackType(value: unknown): value is CosUserFeedbackType {
  return value === 'positive' || value === 'negative' || value === 'correction'
}

export async function POST(request: NextRequest) {
  let userId: string | null = null
  try {
    const access = await getAccess()
    userId = access.userId
  } catch {
    userId = null
  }
  if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const body = await request.json().catch(() => null) as Record<string, unknown> | null
  const conversationId = clean(body?.conversationId, 200)
  const assistantContent = clean(body?.assistantContent, MAX_ASSISTANT_CONTENT_CHARS)
  const feedbackType = body?.feedbackType
  const correctionText = clean(body?.correctionText, MAX_CORRECTION_CHARS)

  if (!conversationId || !assistantContent || !validFeedbackType(feedbackType)) {
    return NextResponse.json({ error: 'Invalid feedback request' }, { status: 400 })
  }
  if (feedbackType === 'correction' && !correctionText) {
    return NextResponse.json({ error: 'Correction text is required' }, { status: 400 })
  }

  const db = cosServiceDb()
  if (!db) return NextResponse.json({ error: 'COS learning store unavailable' }, { status: 503 })

  const conversation = await db
    .from('assistant_conversations')
    .select('id')
    .eq('id', conversationId)
    .eq('user_id', userId)
    .maybeSingle()
  if (conversation.error) {
    console.warn('[cos-user-feedback-learning] conversation lookup failed', conversation.error)
    return NextResponse.json({ error: 'Could not verify conversation' }, { status: 500 })
  }
  if (!conversation.data?.id) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })

  // Derive the prompt and turn correlation from the server-owned transcript. The client may identify
  // the rendered answer, but it cannot supply or rewrite the learning subject or COS turn id.
  const transcript = await db
    .from('assistant_messages')
    .select('role,content,created_at,provenance')
    .eq('conversation_id', conversationId)
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(MAX_CONVERSATION_MESSAGES)
  if (transcript.error) {
    console.warn('[cos-user-feedback-learning] transcript lookup failed', transcript.error)
    return NextResponse.json({ error: 'Could not verify assistant response' }, { status: 500 })
  }

  const messages = (transcript.data ?? []) as ConversationMessage[]
  const matchingAssistantIndexes: number[] = []
  for (let index = 0; index < messages.length; index += 1) {
    if (messages[index]?.role === 'assistant' && messages[index]?.content === assistantContent) {
      matchingAssistantIndexes.push(index)
    }
  }
  if (matchingAssistantIndexes.length === 0) {
    return NextResponse.json({ error: 'Assistant response not found in this conversation' }, { status: 404 })
  }
  // Identical rendered answer text may legitimately occur under different prompts. Without a stable
  // message id in the current UI contract, choosing one would risk teaching COS from the wrong turn.
  if (matchingAssistantIndexes.length !== 1) {
    return NextResponse.json({ error: 'Ambiguous assistant response; feedback target is not unique' }, { status: 409 })
  }
  const assistantIndex = matchingAssistantIndexes[0]
  const assistantMessage = messages[assistantIndex]
  const turnId = clean(asRecord(assistantMessage?.provenance).turnId, 80)

  let prompt = ''
  for (let index = assistantIndex - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === 'user' && typeof messages[index]?.content === 'string') {
      prompt = messages[index]?.content || ''
      break
    }
  }
  if (!prompt.trim()) return NextResponse.json({ error: 'Preceding user prompt not found' }, { status: 409 })

  const result = await recordCosUserFeedbackExperience({
    userId,
    conversationId,
    prompt,
    assistantContent,
    feedbackType,
    correctionText: feedbackType === 'correction' ? correctionText : null,
  })
  if (!result.decision.eligible) {
    return NextResponse.json({ error: result.decision.reason }, { status: 400 })
  }
  if (!result.stored) {
    return NextResponse.json({ error: 'Feedback could not be stored' }, { status: 503 })
  }

  const outcomeAttached = turnId
    ? await attachTurnOutcome(turnId, {
        userFeedback: feedbackType,
        ...(feedbackType === 'negative' || feedbackType === 'correction' ? { repairNeeded: true } : {}),
        source: 'assistant_feedback',
        occurredAt: assistantMessage?.created_at ?? undefined,
      })
    : false

  return NextResponse.json({
    ok: true,
    stored: true,
    repeated: result.repeated,
    semantics: result.decision.evidence.semantics,
    outcomeCorrelation: {
      turnIdPresent: Boolean(turnId),
      attached: outcomeAttached,
    },
    promotion: {
      fact: false,
      skill: false,
    },
  })
}
