import { NextRequest, NextResponse } from 'next/server'
import { getAccess } from '@/lib/auth/access'
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import {
  recordCosUserFeedbackExperience,
  type CosUserFeedbackType,
} from '@/lib/ai/cos/cognitiveUserFeedback'
import { attachTurnOutcome, hashPrompt } from '@/lib/ai/cos/turnExperienceStore'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_CONVERSATION_MESSAGES = 500
const MAX_ASSISTANT_CONTENT_CHARS = 80_000
const MAX_PROMPT_CHARS = 20_000
const MAX_CORRECTION_CHARS = 4_000

type ConversationMessage = {
  role?: string | null
  content?: string | null
  created_at?: string | null
  provenance?: unknown
}

type FeedbackTarget = {
  prompt: string
  turnId: string
  resolution: 'conversation_transcript' | 'latest_cos_provenance'
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

async function targetFromConversation(params: {
  db: NonNullable<ReturnType<typeof cosServiceDb>>
  conversationId: string
  userId: string
  assistantContent: string
}): Promise<{ target: FeedbackTarget | null; error?: string; status?: number }> {
  const { db, conversationId, userId, assistantContent } = params
  const conversation = await db
    .from('assistant_conversations')
    .select('id')
    .eq('id', conversationId)
    .eq('user_id', userId)
    .maybeSingle()
  if (conversation.error) {
    console.warn('[cos-user-feedback-learning] conversation lookup failed', conversation.error)
    return { target: null, error: 'Could not verify conversation', status: 500 }
  }
  if (!conversation.data?.id) return { target: null }

  const transcript = await db
    .from('assistant_messages')
    .select('role,content,created_at,provenance')
    .eq('conversation_id', conversationId)
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(MAX_CONVERSATION_MESSAGES)
  if (transcript.error) {
    console.warn('[cos-user-feedback-learning] transcript lookup failed', transcript.error)
    return { target: null, error: 'Could not verify assistant response', status: 500 }
  }

  const messages = (transcript.data ?? []) as ConversationMessage[]
  const matchingAssistantIndexes: number[] = []
  for (let index = 0; index < messages.length; index += 1) {
    if (messages[index]?.role === 'assistant' && messages[index]?.content === assistantContent) {
      matchingAssistantIndexes.push(index)
    }
  }
  if (matchingAssistantIndexes.length === 0) return { target: null }
  if (matchingAssistantIndexes.length !== 1) {
    return { target: null, error: 'Ambiguous assistant response; feedback target is not unique', status: 409 }
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
  if (!prompt.trim()) return { target: null, error: 'Preceding user prompt not found', status: 409 }

  return {
    target: {
      prompt,
      turnId,
      resolution: 'conversation_transcript',
    },
  }
}

async function targetFromLatestCosProvenance(params: {
  db: NonNullable<ReturnType<typeof cosServiceDb>>
  userId: string
  assistantContent: string
  userPrompt: string
}): Promise<{ target: FeedbackTarget | null; error?: string; status?: number }> {
  const { db, userId, assistantContent, userPrompt } = params
  if (!userPrompt) return { target: null }

  // The right-side Concierge can receive a completed COS answer even when the best-effort
  // conversation-history write is absent. Fall back only to the user's server-owned latest COS
  // provenance, require an exact assistant-text match, and then validate the rendered prompt
  // against the reasoner's durable HMAC/SHA prompt_hash. The client never supplies a turn_id.
  const latest = await db
    .from('cos_latest_turn_provenance')
    .select('assistant_content,provenance,updated_at')
    .eq('user_id', userId)
    .eq('assistant_content', assistantContent)
    .maybeSingle()
  if (latest.error) {
    console.warn('[cos-user-feedback-learning] latest provenance lookup failed', latest.error)
    return { target: null, error: 'Could not verify latest COS response', status: 500 }
  }
  if (!latest.data) return { target: null }

  const turnId = clean(asRecord(latest.data.provenance).turnId, 80)
  if (!turnId) return { target: null, error: 'Latest COS response has no turn correlation', status: 409 }

  const experience = await db
    .from('cos_turn_experience')
    .select('prompt_hash')
    .eq('turn_id', turnId)
    .maybeSingle()
  if (experience.error) {
    console.warn('[cos-user-feedback-learning] turn prompt hash lookup failed', experience.error)
    return { target: null, error: 'Could not verify COS prompt correlation', status: 500 }
  }
  const storedPromptHash = clean(experience.data?.prompt_hash, 160)
  if (!storedPromptHash || hashPrompt(userPrompt) !== storedPromptHash) {
    return { target: null, error: 'Rendered prompt does not match the server-owned COS turn', status: 409 }
  }

  return {
    target: {
      prompt: userPrompt,
      turnId,
      resolution: 'latest_cos_provenance',
    },
  }
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
  const userPrompt = clean(body?.userPrompt, MAX_PROMPT_CHARS)
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

  const transcriptTarget = await targetFromConversation({
    db,
    conversationId,
    userId,
    assistantContent,
  })
  if (transcriptTarget.error) {
    return NextResponse.json({ error: transcriptTarget.error }, { status: transcriptTarget.status || 500 })
  }

  let target = transcriptTarget.target
  if (!target) {
    const latestTarget = await targetFromLatestCosProvenance({
      db,
      userId,
      assistantContent,
      userPrompt,
    })
    if (latestTarget.error) {
      return NextResponse.json({ error: latestTarget.error }, { status: latestTarget.status || 500 })
    }
    target = latestTarget.target
  }

  if (!target) {
    return NextResponse.json({ error: 'Assistant response not found in the verified conversation or latest COS turn' }, { status: 404 })
  }

  const result = await recordCosUserFeedbackExperience({
    userId,
    conversationId,
    prompt: target.prompt,
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

  const outcomeAttached = target.turnId
    ? await attachTurnOutcome(target.turnId, {
        userFeedback: feedbackType,
        ...(feedbackType === 'negative' || feedbackType === 'correction' ? { repairNeeded: true } : {}),
        source: 'assistant_feedback',
      })
    : false

  return NextResponse.json({
    ok: true,
    stored: true,
    repeated: result.repeated,
    semantics: result.decision.evidence.semantics,
    targetResolution: target.resolution,
    outcomeCorrelation: {
      turnIdPresent: Boolean(target.turnId),
      attached: outcomeAttached,
    },
    promotion: {
      fact: false,
      skill: false,
    },
  })
}