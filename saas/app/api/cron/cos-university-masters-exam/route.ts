import { NextRequest, NextResponse } from 'next/server'
import { runCosUniversityMastersExam } from '@/lib/ai/cos/cosUniversityMastersExamRunner'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization') || ''
  if (!secret || auth !== `Bearer ${secret}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const result = await runCosUniversityMastersExam()
  return NextResponse.json({ ok: result.status !== 'error', ...result }, { status: result.status === 'error' ? 500 : 200 })
}
