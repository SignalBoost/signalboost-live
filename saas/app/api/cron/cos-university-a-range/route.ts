import { NextRequest, NextResponse } from 'next/server'
import { runCosUniversityARangeBatch } from '@/lib/ai/cos/cosUniversityARangeRunner'
import { readCosUniversityUndergraduateAcademicLaneGate } from '@/lib/ai/cos/cosUniversityProgramRuntimeGate'

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
    const programGate = await readCosUniversityUndergraduateAcademicLaneGate()
    if (!programGate.allowed) {
      const unavailable = programGate.reason === 'service_database_unavailable'
      return NextResponse.json({ ok: !unavailable, skipped: true, programGate }, { status: unavailable ? 503 : 200 })
    }
    const result = await runCosUniversityARangeBatch()
    return NextResponse.json({
      ok: result.errors.length === 0,
      ...result,
    }, { status: result.errors.length ? 500 : 200 })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('cron COS University A-range failed:', message)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
