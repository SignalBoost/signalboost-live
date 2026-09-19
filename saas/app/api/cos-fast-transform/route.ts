import { NextRequest, NextResponse } from 'next/server'
import { POST as provenanceBrowserPost } from '@/app/api/cos-provenance-browser/route'
import { isFastTextTransform } from '@/lib/ai/cos/fastTextTransformIntent'
import { provenanceBoundarySecret } from '@/lib/ai/cos/provenanceBoundarySecret'

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

function previousAssistantText(body: any): string {
  const messages = Array.isArray(body?.messages) ? body.messages : []
  let sawLatestUser = false
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (!sawLatestUser && message?.role === 'user') {
      sawLatestUser = true
      continue
    }
    if (sawLatestUser && message?.role === 'assistant' && typeof message?.content === 'string') {
      return message.content.trim()
    }
  }
  return ''
}

async function fallThroughToNormalCos(req: NextRequest, body: any): Promise<Response> {
  const boundary = provenanceBoundarySecret()
  if (!boundary) {
    return NextResponse.json({ ok: false, error: 'provenance_boundary_unconfigured' }, { status: 503 })
  }
  const headers = new Headers(req.headers)
  headers.delete('content-length')
  headers.delete('x-signalboost-fast-transform-internal')
  headers.set('content-type', 'application/json')
  headers.set('x-signalboost-provenance-boundary', boundary)
  headers.delete('x-signalboost-fast-transform-attempted')
  const fallback = new NextRequest(req.url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
  return provenanceBrowserPost(fallback)
}

export async function POST(req: NextRequest) {
  const internalRewrite = req.headers.get('x-signalboost-fast-transform-internal') === '1'
  const referer = req.headers.get('referer') || ''
  let legacyOwnerAssistant = false
  try {
    const url = new URL(referer)
    legacyOwnerAssistant = url.origin === req.nextUrl.origin
      && url.pathname.startsWith('/dashboard/assistant')
      && req.headers.get('x-signalboost-surface') === 'cos'
  } catch {}
  if (!internalRewrite && !legacyOwnerAssistant) {
    return NextResponse.json({ ok: false, error: 'fast_transform_ingress_required' }, { status: 403 })
  }

  const body = await req.clone().json().catch(() => ({}))
  const prompt = latestUserText(body)
  const previousAssistant = previousAssistantText(body)
  if (!isFastTextTransform(prompt, { previousAssistant })) {
    return fallThroughToNormalCos(req, body)
  }

  // Middleware is only an ingress shortcut. The actual edit capability lives in canonical COS.
  // Delegating preserves one editor implementation and lets cos-primary apply the same bounded
  // DeepSeek fast lane for Concierge, Assistant, and direct browser traffic.
  return fallThroughToNormalCos(req, body)
}
