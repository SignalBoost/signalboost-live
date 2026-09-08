// saas/app/api/cron/cos-university-graduation/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { runCosUniversityGeneralistGraduationGate } from '@/lib/ai/cos/cosUniversityGraduationRunner'
import { runCosUniversityAdmission } from '@/lib/ai/cos/cosUniversityAdmissionRunner'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization') || ''
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await runCosUniversityGeneralistGraduationGate()
    // Admission runs in the same pass and immediately after, so the tick that issues the
    // undergraduate credential is the tick that opens the next program. Otherwise every academic
    // worker lane goes dark between graduation and admission.
    const admission = await runCosUniversityAdmission()
    const errors = [...result.errors, ...admission.errors]
    return NextResponse.json({ ok: errors.length === 0, ...result, admission }, { status: errors.length ? 500 : 200 })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('cron COS University generalist graduation failed:', message)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
