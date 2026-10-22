import { Queue, Worker, type JobsOptions, type Processor, type WorkerOptions } from 'bullmq'

export const COS_REDIS_URL_ENV = 'COS_REDIS_URL'
export const REDIS_URL_ENV = 'REDIS_URL'

export const queueNames = {
  videoRender: 'video-rendering',
  voiceOver: 'voice-over',
  brandOverlay: 'brand-overlay',
} as const

export type CosQueueName = (typeof queueNames)[keyof typeof queueNames]

export type VideoRenderJobPayload = {
  campaignId: string
  language?: string
  assets: unknown
  bucketName?: string
  requestedAt?: string
  metadata?: Record<string, unknown>
}

export type VoiceOverJobPayload = {
  campaignId: string
  language: string
  videoUrl?: string
  requestedAt?: string
  metadata?: Record<string, unknown>
}

export type BrandOverlayJobPayload = {
  campaignId: string
  language: string
  sourceUrl: string
  aspect?: '9:16' | '16:9'
  requestedAt?: string
  metadata?: Record<string, unknown>
}

export const defaultJobOptions: JobsOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 10_000 },
  removeOnComplete: { age: 86_400, count: 1_000 },
  removeOnFail: { age: 604_800, count: 5_000 },
}

/**
 * BullMQ passes connection options directly to ioredis. A plain { url } is not
 * a recognized ioredis connection option and can silently target localhost.
 * Parse the configured Redis URL into explicit connection options instead.
 */
export function createRedisConnection() {
  const value = process.env[COS_REDIS_URL_ENV] || process.env[REDIS_URL_ENV]
  if (!value) throw new Error(`Missing Redis connection. Set ${COS_REDIS_URL_ENV} or ${REDIS_URL_ENV}.`)

  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    throw new Error('Invalid COS Redis connection URL')
  }
  if (parsed.protocol !== 'redis:' && parsed.protocol !== 'rediss:') {
    throw new Error('COS Redis URL must use redis:// or rediss://')
  }
  if (!parsed.hostname || (parsed.port && (!Number.isInteger(Number(parsed.port)) || Number(parsed.port) < 1 || Number(parsed.port) > 65535))) {
    throw new Error('Invalid COS Redis host or port')
  }
  const database = parsed.pathname && parsed.pathname !== '/' ? Number(parsed.pathname.slice(1)) : 0
  if (!Number.isSafeInteger(database) || database < 0) throw new Error('Invalid COS Redis database')
  return {
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 6379,
    db: database,
    ...(parsed.username ? { username: decodeURIComponent(parsed.username) } : {}),
    ...(parsed.password ? { password: decodeURIComponent(parsed.password) } : {}),
    ...(parsed.protocol === 'rediss:' ? { tls: {} } : {}),
  }
}

export function createCosQueues(connection = createRedisConnection()) {
  return {
    videoRenderQueue: new Queue<VideoRenderJobPayload>(queueNames.videoRender, { connection, defaultJobOptions }),
    voiceOverQueue: new Queue<VoiceOverJobPayload>(queueNames.voiceOver, { connection, defaultJobOptions }),
    brandOverlayQueue: new Queue<BrandOverlayJobPayload>(queueNames.brandOverlay, { connection, defaultJobOptions }),
  }
}

export function createCosWorker<T>(
  queueName: CosQueueName,
  processor: Processor<T, unknown, string>,
  options: Omit<WorkerOptions, 'connection'> & { connection?: ReturnType<typeof createRedisConnection> } = {},
) {
  const { connection = createRedisConnection(), ...workerOptions } = options
  const worker = new Worker<T>(queueName, processor, { connection: { ...connection, maxRetriesPerRequest: null }, ...workerOptions })
  worker.on('completed', (job) => console.info('COSA queue job completed', { queue: queueName, jobId: job.id, name: job.name }))
  worker.on('failed', (job, error) => console.error('COSA queue job failed', { queue: queueName, jobId: job?.id, name: job?.name, error: error.message }))
  worker.on('error', (error) => console.error('COSA queue worker error', { queue: queueName, error: error.message }))
  return worker
}
