import { NextRequest, NextResponse } from 'next/server'
import { recordCosUniversityProductionPath } from '@/lib/ai/cos/cosUniversityProductionAssurance'
import { readCosUniversityDailyLaneCadence } from '@/lib/ai/cos/cosUniversityDailyLaneCadence'
import { runCosUniversityRetention } from '@/lib/ai/cos/cosUniversityRetentionRunner'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const cadence = await readCosUniversityDailyLaneCadence('delayed_retention')
    if (!cadence.due) {
      await recordCosUniversityProductionPath({ path: 'delayed_retention', invocationSucceeded: true, evidence: { dailyCadence: 'not_due', runnerInvoked: false, cadence } })
      return NextResponse.json({ ok: true, skipped: true, cadence })
    }
    const result = await runCosUniversityRetention()
    const errors = Array.isArray(result.errors) ? result.errors : []
    await recordCosUniversityProductionPath({ path: 'delayed_retention', invocationSucceeded: errors.length === 0, evidence: result })
    return NextResponse.json({ ok: errors.length === 0, ...result }, { status: errors.length ? 500 : 200 })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('cron COS University retention failed:', message)
    await recordCosUniversityProductionPath({ path: 'delayed_retention', invocationSucceeded: false, evidence: { error: message } })
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
