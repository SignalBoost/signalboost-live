// saas/app/api/hub/infra-pr/[id]/route.ts
import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/access'
import { closeInfrastructurePR, getInfrastructurePR } from '@/lib/hub/pr-engine'
import { redactPrForDisplay } from '@/lib/hub/pr-redact'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
type RouteContext = { params: Promise<{ id: string }> }

export async function GET(_request: Request, context: RouteContext) {
  const guard = await requireAdmin()
  if (!guard.ok) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status })
  const { id } = await context.params
  const result = await getInfrastructurePR(id)
  if (!result.ok || !result.pr) return NextResponse.json(result, { status: 404 })
  return NextResponse.json({ ok: true, pr: redactPrForDisplay(result.pr) })
}

export async function DELETE(_request: Request, context: RouteContext) {
  const guard = await requireAdmin()
  if (!guard.ok) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status })
  const { id } = await context.params
  const result = await closeInfrastructurePR({ id, approvedBy: guard.ctx.userId })
  if (!result.ok) return NextResponse.json(result, { status: 400 })
  return NextResponse.json(result)
}
