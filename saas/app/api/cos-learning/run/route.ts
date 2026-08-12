import { NextResponse } from 'next/server'
import { getAccess } from '@/lib/auth/access'
import { runMiningPipeline } from '@/lib/cos/mining/pipeline'
import { runDailyAutonomousLearning } from '@/lib/cos/dailyAutonomousLearning'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

async function runManualLearning() {
  const access = await getAccess()
  if (!access.userId) return NextResponse.json({ ok: false, error: 'Not signed in.' }, { status: 401 })
  if (!access.isOwner && !access.isAdmin) return NextResponse.json({ ok: false, error: 'Owner or admin access required.' }, { status: 403 })

  const mining = await runMiningPipeline({ job: 'daily', actor: `manual:${access.userId}` })
  if (!mining.ok || !mining.summary) {
    return NextResponse.json({ ok: false, error: mining.error || 'COS mining failed.' }, { status: 500 })
  }

  try {
    const learning = await runDailyAutonomousLearning({ miningSummary: mining.summary })
    return NextResponse.json({
      ok: true,
      triggeredBy: access.email || access.userId,
      summary: mining.summary,
      learning,
    })
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      summary: mining.summary,
    }, { status: 500 })
  }
}

export async function GET() { return runManualLearning() }
export async function POST() { return runManualLearning() }
