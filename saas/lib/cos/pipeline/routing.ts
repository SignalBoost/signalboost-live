import { dispatchToCloudRenderer, getSystemCpuLoad } from './dependencies'
import { createCosQueues, type VideoRenderJobPayload } from './queues'
import { verifyOrProvisionBucket } from './storage'

export type RenderRouteResult =
  | { ok: true; route: 'local'; jobId?: string; bucketName: string }
  | { ok: true; route: 'cloud'; dispatch: unknown; bucketName: string }
  | { ok: false; route: 'rejected'; error: string; bucketName?: string }

const LOCAL_WAITING_THRESHOLD = Number(process.env.COS_LOCAL_RENDER_WAITING_THRESHOLD || 25)
const LOCAL_CPU_THRESHOLD = Number(process.env.COS_LOCAL_RENDER_CPU_THRESHOLD || 0.75)

export async function routeRenderJob(jobPayload: VideoRenderJobPayload): Promise<RenderRouteResult> {
  const bucketName = jobPayload.bucketName || process.env.COS_VIDEO_RENDER_BUCKET || 'video-renders'
  const bucket = await verifyOrProvisionBucket(bucketName)
  if (!bucket.ok) {
    console.error('COSA render route rejected before enqueue', { campaignId: jobPayload.campaignId, bucketName, error: bucket.error })
    return { ok: false, route: 'rejected', error: bucket.error || 'Bucket verification failed', bucketName }
  }

  const queues = createCosQueues()
  try {
    const [waiting, delayed, cpuLoad] = await Promise.all([
      queues.videoRenderQueue.getWaitingCount(),
      queues.videoRenderQueue.getDelayedCount(),
      getSystemCpuLoad(),
    ])
    const localSaturated = waiting + delayed >= LOCAL_WAITING_THRESHOLD || cpuLoad >= LOCAL_CPU_THRESHOLD
    if (localSaturated) {
      const dispatch = await dispatchToCloudRenderer({ ...jobPayload, bucketName: bucket.bucketName, routing: { waiting, delayed, cpuLoad, reason: 'local_saturated' } })
      return { ok: true, route: 'cloud', dispatch, bucketName: bucket.bucketName }
    }
    const job = await queues.videoRenderQueue.add('render-video', { ...jobPayload, bucketName: bucket.bucketName, requestedAt: jobPayload.requestedAt || new Date().toISOString() })
    return { ok: true, route: 'local', jobId: job.id, bucketName: bucket.bucketName }
  } finally {
    await queues.videoRenderQueue.close()
    await queues.voiceOverQueue.close()
    await queues.brandOverlayQueue.close()
  }
}
