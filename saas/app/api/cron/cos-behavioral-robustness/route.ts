import { NextRequest, NextResponse } from 'next/server'
import { runCosBehavioralRobustnessPracticum } from '@/lib/ai/cos/cosBehavioralRobustnessRunner'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const result = await runCosBehavioralRobustnessPracticum(2)
    return NextResponse.json({ ok: result.errors.length === 0, nonCredit: true, authorityExpanded: false, ...result }, { status: result.errors.length ? 500 : 200 })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('COS behavioral robustness practicum failed:', message)
    return NextResponse.json({ ok: false, nonCredit: true, authorityExpanded: false, error: message }, { status: 500 })
  }
}
