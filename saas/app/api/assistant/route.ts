import { NextRequest, NextResponse } from 'next/server'
import { POST as cosPrimaryPost } from '@/app/api/cos-primary/route'
import { getAccess } from '@/lib/auth/access'
import { persistTurn } from '@/lib/ai/tools/conversationHistory'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

type AssistantMessage = { role?: string; content?: unknown }

function latestUserText(body: any): string {
  const messages = (Array.isArray(body?.messages) ? body.messages : []) as AssistantMessage[]
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role !== 'user') continue
    const content = messages[index]?.content
    if (typeof content === 'string') return content.trim()
    if (Array.isArray(content)) {
      return content.map((block: any) => String(block?.text || '')).join('\n').trim()
    }
  }
  return ''
}

function conversationIdFrom(body: any): string | null {
  const value = String(body?.context?.conversationId || '')
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value) ? value : null
}

function withoutNestedConversationPersistence(body: any): any {
  const context = body?.context && typeof body.context === 'object' && !Array.isArray(body.context)
    ? { ...body.context }
    : {}
  delete context.conversationId
  return {
    ...body,
    context: {
      ...context,
      assistantSurface: 'chief_of_staff',
      ownerMode: true,
    },
  }
}

function internalRequest(req: NextRequest, body: any): NextRequest {
  const headers = new Headers(req.headers)
  headers.set('content-type', 'application/json')
  headers.delete('content-length')
  headers.set('x-signalboost-assistant-surface', 'chief-of-staff')
  return new NextRequest(new URL('/api/cos-primary', req.url), {
    method: 'POST',
    headers,
    body: JSON.stringify(withoutNestedConversationPersistence(body)),
  })
}

export async function POST(req: NextRequest) {
  const access = await getAccess().catch(() => null)
  if (!access?.userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (!access.isOwner) return NextResponse.json({ error: 'Chief of Staff is owner-only' }, { status: 403 })

  const body = await req.clone().json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid assistant request' }, { status: 400 })
  }

  const prompt = latestUserText(body)
  const conversationId = conversationIdFrom(body)
  const response = await cosPrimaryPost(internalRequest(req, body))

  // The private Chief of Staff owns its transcript. Strip conversationId before invoking
  // COS Primary so an internal Concierge/support fallback cannot persist the same turn too.
  // Await this write before returning so feedback on the just-rendered answer cannot race
  // an asynchronous history write and return a false 404.
  if (prompt && conversationId) {
    try {
      const payload = await response.clone().json()
      const reply = typeof payload?.reply === 'string'
        ? payload.reply.trim()
        : typeof payload?.error === 'string'
          ? payload.error.trim()
          : ''
      if (reply) {
        const provenance = payload?.execution_provenance && typeof payload.execution_provenance === 'object'
          ? payload.execution_provenance
          : undefined
        await persistTurn({
          conversationId,
          userId: access.userId,
          userMessage: prompt,
          assistantReply: reply,
          provenance,
        })
      }
    } catch (error) {
      console.warn('[cos-assistant-history] response persistence failed', error instanceof Error ? error.message : String(error))
    }
  }

  return response
}
