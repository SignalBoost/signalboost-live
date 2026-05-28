// GET /api/operator/video?jobId=job_xxxxxxxx
//
// The client calls this after the apply route returns to check whether the
// background hero video is ready. Poll every 5–8 seconds until status is
// 'done' or 'failed'. On 'done', videoUrl is the fal.ai CDN URL of the clip.

import { NextRequest, NextResponse } from 'next/server'
import { operatorStore } from '@/lib/operator/store'
import { fetchSiteVideo } from '@/lib/operator/video'

export async function GET(req: NextRequest) {
  try {
    const jobId = req.nextUrl.searchParams.get('jobId')

    if (!jobId) {
      return NextResponse.json({ error: 'jobId is required' }, { status: 400 })
    }

    const job = operatorStore.jobs.get(jobId)
    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    }

    // If video already resolved (done or failed), return immediately
    if (job.videoStatus === 'done') {
      return NextResponse.json({ status: 'done', videoUrl: job.videoUrl })
    }

    if (job.videoStatus === 'failed') {
      return NextResponse.json({ status: 'failed' })
    }

    // Still rendering — if we have a requestId, check fal for an update
    if (job.videoRequestId && job.videoModel) {
      const result = await fetchSiteVideo(job.videoRequestId, job.videoModel)

      if (result.status === 'done') {
        job.videoStatus  = 'done'
        job.videoUrl     = result.videoUrl
        job.updatedAt    = new Date().toISOString()
        console.log('Operator video ready', { jobId, videoUrl: result.videoUrl })
        return NextResponse.json({ status: 'done', videoUrl: result.videoUrl })
      }

      if (result.status === 'failed') {
        job.videoStatus = 'failed'
        job.updatedAt   = new Date().toISOString()
        console.error('Operator video failed', { jobId, error: result.error })
        return NextResponse.json({ status: 'failed' })
      }

      // Still rendering
      return NextResponse.json({ status: 'rendering' })
    }

    // requestId not yet written by the fire-and-forget (race: submit is in
    // flight), treat as still rendering
    return NextResponse.json({ status: 'rendering' })

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('Operator video status error', message)
    return NextResponse.json({ status: 'rendering' })
  }
}
