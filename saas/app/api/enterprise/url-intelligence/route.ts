import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/outreach/security'
import { analyzePublicUrl } from '@/lib/enterprise/url-intelligence'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: Request) {
  const context = await requireAdmin()
  if (context instanceof NextResponse) return context

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body.' }, { status: 400 })
  }

  const sourceUrl = typeof (body as { sourceUrl?: unknown })?.sourceUrl === 'string'
    ? (body as { sourceUrl: string }).sourceUrl.trim()
    : ''

  if (!sourceUrl) return NextResponse.json({ ok: false, error: 'sourceUrl is required.' }, { status: 400 })
  if (sourceUrl.length > 2_048) return NextResponse.json({ ok: false, error: 'sourceUrl is too long.' }, { status: 400 })

  try {
    const result = await analyzePublicUrl(sourceUrl)
    return NextResponse.json({ ok: true, result })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'URL analysis failed.'
    const clientError = /required|supported|public|private|reserved|redirect|content type|HTTP 4|too long|exceeds/i.test(message)
    return NextResponse.json({ ok: false, error: message }, { status: clientError ? 400 : 502 })
  }
}
