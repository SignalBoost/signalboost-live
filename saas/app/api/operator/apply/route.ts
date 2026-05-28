import { NextRequest, NextResponse } from 'next/server'
import { newId, operatorStore, type OperatorJob } from '@/lib/operator/store'

export async function POST(req: NextRequest) {
  try {
    const body     = await req.json()
    const planId   = body?.planId
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
      id:                newId('job'),
      planId,
      state:             'published',
      commitMessage:     `operator.commitPrefix ${plan.request.slice(0, 72)}`,
      publishMessage:    'operator.success.published',
      rollbackAvailable: true,
      createdAt:         now,
      updatedAt:         now,
      videoStatus:       'rendering',
    }

    operatorStore.jobs.set(job.id, job)

    // ── Fire-and-forget hero video generation ────────────────────────────────
    // Dynamic import keeps fal-ai out of the top-level module graph so it
    // never interferes with Next.js route type-checking at build time.
    const jobId = job.id
    ;(async () => {
      try {
        const { buildSiteVideoPrompt, startSiteVideo } = await import('@/lib/operator/video')
        const prompt = buildSiteVideoPrompt({ description: plan.request })
        const result = await startSiteVideo(prompt)
        const j = operatorStore.jobs.get(jobId)
        if (!j) return
        if (result.ok) {
          j.videoRequestId = result.requestId
          j.videoModel     = result.model
          j.videoStatus    = 'rendering'
          j.updatedAt      = new Date().toISOString()
          console.log('Operator video started', { jobId, requestId: result.requestId })
        } else {
          j.videoStatus = 'failed'
          j.updatedAt   = new Date().toISOString()
          console.error('Operator video start failed', result.error)
        }
      } catch (err) {
        const j = operatorStore.jobs.get(jobId)
        if (j) {
          j.videoStatus = 'failed'
          j.updatedAt   = new Date().toISOString()
        }
        console.error('Operator video unexpected error', err)
      }
    })()

    return NextResponse.json({
      job,
      userMessage: 'operator.success.approvedAndPublished',
    })
  } catch (error) {
    console.error('Operator apply error', error)
    return NextResponse.json({ error: 'operator.errors.applyFailed' }, { status: 500 })
  }
}
