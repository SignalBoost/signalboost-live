import { NextResponse } from 'next/server'
import { listBuilderContinuations } from '@/lib/builder/job-store'
import { runBuilderJob } from '@/lib/builder/job-runner'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  // Original authenticated jobs supply identity and objective. No request-supplied work is accepted.
  // Overlapping ticks are safe: each invocation must win the atomic, generation-fenced claim.
  const jobs = await listBuilderContinuations()
  await Promise.all(jobs.map(job => runBuilderJob(job.id, job.userId)))
  return NextResponse.json({ ok: true, candidates: jobs.length })
}
