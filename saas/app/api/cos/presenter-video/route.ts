import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/outreach/security'
import { buildPresenterVideoDraft } from '@/lib/cos/presenter-video'
import type { PresenterVideoInput } from '@/lib/cos/presenter-video'

export const dynamic = 'force-dynamic'

export async function GET() {
  const ctx = await requireAdmin()
  if (ctx instanceof NextResponse) return ctx

  const draft = buildPresenterVideoDraft()
  return NextResponse.json({ ok: true, draft })
}

export async function POST(req: NextRequest) {
  const ctx = await requireAdmin()
  if (ctx instanceof NextResponse) return ctx

  let body: PresenterVideoInput
  try { body = await req.json() } catch { body = {} }

  const draft = buildPresenterVideoDraft(body || {})
  return NextResponse.json({ ok: true, draft })
}
