import { NextRequest, NextResponse } from 'next/server'
import { operatorStore } from '@/lib/operator/store'

export async function GET(req: NextRequest) {
  const jobId = req.nextUrl.searchParams.get('jobId')

  if (!jobId) {
    return NextResponse.json({ error: 'operator.errors.jobIdRequired' }, { status: 400 })
  }

  const job = operatorStore.jobs.get(jobId)
  if (!job) {
    return NextResponse.json({ error: 'operator.errors.statusNotFound' }, { status: 404 })
  }

  return NextResponse.json({ job })
}
