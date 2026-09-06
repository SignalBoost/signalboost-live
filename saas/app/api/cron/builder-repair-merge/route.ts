import { NextResponse } from 'next/server'
import { completePendingRepositoryRepairMerges } from '@/lib/builder/repository-repair-merge-continuation'
import { builderAutoMergeSnapshotPort } from '@/lib/builder/repository-repair-snapshot-host'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const result = await completePendingRepositoryRepairMerges({
    snapshotPort: builderAutoMergeSnapshotPort(),
    deadlineAtMs: Date.now() + 260_000,
  })
  return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store, max-age=0' } })
}
