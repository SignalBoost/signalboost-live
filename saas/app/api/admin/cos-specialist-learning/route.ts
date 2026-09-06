import { NextResponse } from 'next/server'
import { requireOwner } from '@/lib/auth/access'
import { readSpecialistCompetency } from '@/lib/ai/cos/specialistLearningStore'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const guard = await requireOwner()
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status })
  const report = await readSpecialistCompetency('software')
  return NextResponse.json({
    ...report,
    orchestrator: 'cos',
    specialistFamily: 'software',
    semantics: 'telemetry_only_no_authority_or_mastery_grant',
  }, { status: report.ok ? 200 : 503 })
}
