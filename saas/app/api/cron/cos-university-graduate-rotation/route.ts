import { NextRequest, NextResponse } from 'next/server'
import { runGraduateRotationController } from '@/lib/ai/cos/cosUniversityGraduateRotationController'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const result = await runGraduateRotationController()
  return NextResponse.json(result.body, { status: result.status })
}
