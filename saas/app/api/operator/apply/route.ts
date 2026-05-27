import { NextRequest, NextResponse } from 'next/server'
import { newId, operatorStore, type OperatorJob } from '@/lib/operator/store'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const planId = body?.planId
    const approved = body?.approved

    if (!planId || typeof planId !== 'string') {
      return NextResponse.json({ error: 'operator.errors.planIdRequired' }, { status: 400 })
    }

    const plan = operatorStore.plans.get(planId)
    if (!plan) {
      return NextResponse.json({ error: 'operator.errors.planNotFound' }, { status: 404 })
    }

    if (!approved) {
      return NextResponse.json({ error: 'operator.errors.approvalRequired' }, { status: 400 })
    }

    const now = new Date().toISOString()
    const job: OperatorJob = {
      id: newId('job'),
      planId,
      state: 'published',
      commitMessage: `operator.commitPrefix ${plan.request.slice(0, 72)}`,
      publishMessage: 'operator.success.published',
      rollbackAvailable: true,
      createdAt: now,
      updatedAt: now,
    }

    operatorStore.jobs.set(job.id, job)

    return NextResponse.json({
      job,
      userMessage: 'operator.success.approvedAndPublished',
    })
  } catch (error) {
    console.error('Operator apply error', error)
    return NextResponse.json({ error: 'operator.errors.applyFailed' }, { status: 500 })
  }
}
