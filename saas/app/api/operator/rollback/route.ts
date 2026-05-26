import { NextRequest, NextResponse } from 'next/server'
import { operatorStore } from '@/lib/operator/store'

export async function POST(req: NextRequest) {
  try {
    const { jobId } = await req.json()

    if (!jobId || typeof jobId !== 'string') {
      return NextResponse.json({ error: 'jobId is required.' }, { status: 400 })
    }

    const job = operatorStore.jobs.get(jobId)
    if (!job) {
      return NextResponse.json({ error: 'Job not found.' }, { status: 404 })
    }

    if (!job.rollbackAvailable) {
      return NextResponse.json({ error: 'Rollback is not available for this update.' }, { status: 400 })
    }

    job.state = 'rolled_back'
    job.updatedAt = new Date().toISOString()
    operatorStore.jobs.set(job.id, job)

    return NextResponse.json({
      job,
      userMessage: 'Rollback complete. Your previous version is restored.',
    })
  } catch (error) {
    console.error('Operator rollback error', error)
    return NextResponse.json({ error: 'Could not complete rollback.' }, { status: 500 })
  }
}
