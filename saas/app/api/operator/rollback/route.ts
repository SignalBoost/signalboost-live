import { NextRequest, NextResponse } from 'next/server'
import { operatorStore } from '@/lib/operator/store'

export async function POST(req: NextRequest) {
  try {
    const { jobId } = await req.json()

    if (!jobId || typeof jobId !== 'string') {
      return NextResponse.json({ error: 'operator.errors.jobIdRequired' }, { status: 400 })
    }

    const job = operatorStore.jobs.get(jobId)
    if (!job) {
      return NextResponse.json({ error: 'operator.errors.jobNotFound' }, { status: 404 })
    }

    if (!job.rollbackAvailable) {
      return NextResponse.json({ error: 'operator.errors.rollbackUnavailable' }, { status: 400 })
    }

    job.state = 'rolled_back'
    job.updatedAt = new Date().toISOString()
    operatorStore.jobs.set(job.id, job)

    return NextResponse.json({
      job,
      userMessage: 'operator.success.rollbackComplete',
    })
  } catch (error) {
    console.error('Operator rollback error', error)
    return NextResponse.json({ error: 'operator.errors.rollbackFailed' }, { status: 500 })
  }
}
