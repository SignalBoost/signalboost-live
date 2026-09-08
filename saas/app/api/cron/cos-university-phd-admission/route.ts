import { NextRequest, NextResponse } from 'next/server'
import { runCosUniversityPhdAdmission } from '@/lib/ai/cos/cosUniversityPhdRuntime'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization') || ''
  if (!secret || auth !== `Bearer ${secret}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (process.env.COS_UNIVERSITY_PHD_RUNTIME_ENABLED !== 'true') {
    return NextResponse.json({ ok: true, enabled: false, admitted: false, semantics: 'phd_runtime_fail_closed' })
  }
  try {
    const result = await runCosUniversityPhdAdmission(new Date())
    return NextResponse.json({ ok: result.errors.length === 0, enabled: true, ...result }, { status: result.errors.length ? 500 : 200 })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ ok: false, enabled: true, error: message }, { status: 500 })
  }
}
