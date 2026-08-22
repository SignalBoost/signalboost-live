import { NextRequest } from 'next/server'
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
  return { ...body, context }
}

function internalRequest(req: NextRequest, body: any): NextRequest {
  const headers = new Headers(req.headers)
  headers.set('content-type', 'application/json')
  headers.delete('content-length')
  return new NextRequest(new URL('/api/cos-primary', req.url), {
    method: 'POST',
    headers,
    body: JSON.stringify(withoutNestedConversationPersistence(body)),
  })
}

export async function POST(req: NextRequest) {
  const body = await req.clone().json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return cosPrimaryPost(new NextRequest(req.clone()))
  }

  const prompt = latestUserText(body)
  const conversationId = conversationIdFrom(body)
  const response = await cosPrimaryPost(internalRequest(req, body))

  // The dedicated Assistant owns its own transcript. Strip conversationId before invoking
  // COS Primary so any internal Concierge/support fallback cannot persist the same turn too.
  // Await this one write before returning so feedback can target the just-rendered response
  // immediately instead of racing an after() history write.
  if (prompt && conversationId) {
    const access = await getAccess().catch(() => null)
    if (access?.userId) {
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
  }

  return response
}
