import { NextRequest, NextResponse } from 'next/server'
import { POST as cosPrimaryPost, isFastTextTransform } from '@/app/api/cos-primary/route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

function latestUserText(body: any): string {
  const messages = Array.isArray(body?.messages) ? body.messages : []
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message?.role === 'user' && typeof message?.content === 'string') return message.content.trim()
  }
  return ''
}

export async function POST(req: NextRequest) {
  const body = await req.clone().json().catch(() => ({}))
  const prompt = latestUserText(body)
  if (!isFastTextTransform(prompt)) {
    return NextResponse.json({
      ok: false,
      error: 'fast_text_transform_required',
      reply: 'This endpoint only accepts edit, rewrite, proofread, polish, translate, shorten, and equivalent text-transform requests.',
      execution_allowed: false,
      external_action_taken: false,
    }, { status: 400 })
  }

  const headers = new Headers(req.headers)
  headers.set('content-type', 'application/json')
  headers.set('x-signalboost-surface', 'cos')
  headers.delete('content-length')

  return cosPrimaryPost(new NextRequest(new URL('/api/cos-primary', req.url), {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  }))
}
