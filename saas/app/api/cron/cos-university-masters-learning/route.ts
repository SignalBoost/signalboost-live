import { NextRequest, NextResponse } from 'next/server'
import { runCosUniversityMastersLearning } from '@/lib/ai/cos/cosUniversityMastersLearningRunner'
import { recordCosUniversityProductionPath } from '@/lib/ai/cos/cosUniversityProductionAssurance'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization') || ''
  if (!secret || auth !== `Bearer ${secret}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const result = await runCosUniversityMastersLearning({ maxStudyPlans: 2 })
  await recordCosUniversityProductionPath({ path: 'masters_learning', invocationSucceeded: result.status !== 'error', evidence: result })
  return NextResponse.json({ ok: result.status !== 'error', ...result }, { status: result.status === 'error' ? 500 : 200 })
}
