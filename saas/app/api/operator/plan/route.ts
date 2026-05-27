import { NextRequest, NextResponse } from 'next/server'
import { buildPlan } from '@/lib/operator/planner'
import { operatorStore } from '@/lib/operator/store'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const request = body?.request

    if (!request || typeof request !== 'string') {
      return NextResponse.json({ error: 'operator.errors.requestRequired' }, { status: 400 })
    }

    const plan = await buildPlan(request)
    operatorStore.plans.set(plan.id, plan)

    return NextResponse.json({ plan })
  } catch (error) {
    console.error('Operator plan error', error)
    return NextResponse.json({ error: 'operator.errors.planCreateFailed' }, { status: 500 })
  }
}
