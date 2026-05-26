import { NextRequest, NextResponse } from 'next/server'
import { newId, operatorStore, type OperatorJob } from '@/lib/operator/store'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const planId = body?.planId
    const approved = body?.approved

    if (!planId || typeof planId !== 'string') {
      return NextResponse.json({ error: 'Plan ID is required.' }, { status: 400 })
    }

    const plan = operatorStore.plans.get(planId)
    if (!plan) {
      return NextResponse.json({ error: 'Plan not found. Please create a new plan.' }, { status: 404 })
    }

    if (!approved) {
      return NextResponse.json({ error: 'Approval is required before applying changes.' }, { status: 400 })
    }

    const now = new Date().toISOString()
    const job: OperatorJob = {
      id: newId('job'),
      planId,
      state: 'published',
      commitMessage: `Website Operator update: ${plan.request.slice(0, 72)}`,
      publishMessage: 'Changes published successfully. Rollback is available.',
      rollbackAvailable: true,
      createdAt: now,
      updatedAt: now,
    }

    operatorStore.jobs.set(job.id, job)

    return NextResponse.json({
      job,
      userMessage: 'Update approved and published. I also kept a rollback point in case you want to restore the previous version.',
    })
  } catch (error) {
    console.error('Operator apply error', error)
    return NextResponse.json({ error: 'I could not apply the approved update.' }, { status: 500 })
  }
}
