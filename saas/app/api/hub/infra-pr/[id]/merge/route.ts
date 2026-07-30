// saas/app/api/hub/infra-pr/[id]/merge/route.ts
// The existing PR engine forwards this request's owner session cookie when it
// replays every stored provider action.
import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/access'
import { mergeInfrastructurePR } from '@/lib/hub/pr-engine'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin()
  if (!guard.ok) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status })
  const { id } = await context.params
  const result = await mergeInfrastructurePR({
    id,
    approvedBy: guard.ctx.userId,
    origin: new URL(request.url).origin,
    cookie: request.headers.get('cookie') || '',
  })
  if (!result.ok) return NextResponse.json(result, { status: 400 })
  return NextResponse.json(result)
}
