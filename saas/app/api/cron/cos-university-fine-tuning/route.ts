import { NextRequest, NextResponse } from 'next/server'
import { runCosUniversityControlledFineTuning } from '@/lib/ai/cos/cosUniversityControlledFineTuning'
import { recordCosUniversityProductionPath } from '@/lib/ai/cos/cosUniversityProductionAssurance'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const result = await runCosUniversityControlledFineTuning(new Date())
    await recordCosUniversityProductionPath({ path: 'controlled_fine_tuning', invocationSucceeded: true, evidence: result })
    return NextResponse.json({ ok: true, ...result })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await recordCosUniversityProductionPath({ path: 'controlled_fine_tuning', invocationSucceeded: false, evidence: { error: message } }).catch(() => null)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
