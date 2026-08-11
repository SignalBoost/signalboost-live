import { NextRequest, NextResponse } from 'next/server'
import { stopRunpodReasonerIfIdle } from '@/lib/ai/cos/runpodLifecycle'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization') || ''
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await stopRunpodReasonerIfIdle()
    return NextResponse.json({ ok: true, ...result })
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : 'RunPod idle shutdown failed',
    }, { status: 500 })
  }
}
