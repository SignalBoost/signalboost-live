// saas/app/api/hub/infra-pr/route.ts
import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/access'
import { listInfrastructurePRs } from '@/lib/hub/pr-engine'
import { redactPrsForDisplay } from '@/lib/hub/pr-redact'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const guard = await requireAdmin()
  if (!guard.ok) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status })
  const result = await listInfrastructurePRs(undefined, 50)
  if (!result.ok) return NextResponse.json(result, { status: 500 })
  return NextResponse.json({ ok: true, prs: redactPrsForDisplay(result.prs) })
}
