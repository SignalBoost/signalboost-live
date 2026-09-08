import { NextRequest, NextResponse } from 'next/server'
import { runCosUniversityGeneralistGraduationGate } from '@/lib/ai/cos/cosUniversityGraduationRunner'

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
    return NextResponse.json({ ok: result.errors.length === 0, ...result }, { status: result.errors.length ? 500 : 200 })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('cron COS University generalist graduation failed:', message)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
