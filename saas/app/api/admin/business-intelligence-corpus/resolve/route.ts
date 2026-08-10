import { NextRequest, NextResponse } from 'next/server'
import { requireOwner } from '@/lib/auth/access'
import { resolveCompanyIntelligence } from '@/lib/business-intelligence-corpus/runtime.ts'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const guard = await requireOwner()
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status })

  const body = await req.json().catch(() => ({}))
  const query = typeof body?.query === 'string' ? body.query.trim() : ''
  const canonicalDomain = typeof body?.canonicalDomain === 'string' ? body.canonicalDomain.trim() : undefined
  if (!query && !canonicalDomain) {
    return NextResponse.json({ error: 'CORPUS_QUERY_REQUIRED' }, { status: 400 })
  }

  const resolved = await resolveCompanyIntelligence({
    lookup: {
      query: query || canonicalDomain || '',
      canonicalDomain,
      minConfidence: Number.isFinite(Number(body?.minConfidence)) ? Number(body.minConfidence) : undefined,
      requireFresh: body?.requireFresh !== false,
    },
    allowProviderFallback: body?.allowProviderFallback !== false,
  })

  return NextResponse.json({ ok: Boolean(resolved.result), ...resolved }, { status: resolved.result ? 200 : 404 })
}
