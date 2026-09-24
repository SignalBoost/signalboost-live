import { NextRequest, NextResponse } from 'next/server'
import { runOpenSourceContinuityLearning } from '@/lib/cos/openSourceContinuityLearning.ts'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 180

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization') || ''
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const learning = await runOpenSourceContinuityLearning()
    return NextResponse.json({ ok: true, learning })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[cos-open-source-continuity-failed]', message)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
