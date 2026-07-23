/**
 * Explicit, dependency-injected Mission worker runtime.  This module has no
 * import-time connections or workers: an operator must call start().
 */
export interface MissionWorkerConfig {
  enabled: boolean; publisherEnabled: boolean; consumerEnabled: boolean
  publishIntervalMs: number; maxPublishBatch: number; maxAttempts: number
  leaseMs: number; heartbeatMs: number; queueWarningAgeMs: number; queueCriticalAgeMs: number
}
export interface MissionLease { owner: string; fencingToken: number; expiresAt: string }
export interface MissionRuntimeDiagnostics {
  generatedAt: string; runtimeEnabled: boolean; publisherEnabled: boolean; consumerEnabled: boolean
  publisherOwner?: string; leaseExpiresAt?: string; pendingOutboxCount: number; claimedOutboxCount: number
  retryWaitCount: number; deadLetterCount: number; oldestPendingAgeMs?: number; queueDepth: number
  activeJobs: number; delayedJobs: number; failedJobs: number; completedJobs: number; duplicateEvents: number
  recoveredEvents: number; lastPublishAt?: string; lastConsumeAt?: string; lastErrorCode?: string
  status: 'healthy'|'warning'|'critical'|'disabled'
}
export interface MissionRuntimePorts {
  acquireLease(owner: string, leaseMs: number): Promise<MissionLease | undefined>
  renewLease(lease: MissionLease, leaseMs: number): Promise<MissionLease | undefined>
  releaseLease(lease: MissionLease): Promise<void>
  recover(lease: MissionLease, limit: number): Promise<number>
  publish(lease: MissionLease, limit: number): Promise<number>
  startConsumer?(): Promise<void>; stopConsumer?(): Promise<void>
  snapshot(): Promise<Omit<MissionRuntimeDiagnostics, 'generatedAt'|'runtimeEnabled'|'publisherEnabled'|'consumerEnabled'|'publisherOwner'|'leaseExpiresAt'|'status'>>
}
export interface MissionWorkerRuntime { start(): Promise<void>; stop(): Promise<void>; health(): Promise<MissionRuntimeDiagnostics> }
export type MissionLogger = { info(event: string, fields?: Record<string, unknown>): void; warn(event: string, fields?: Record<string, unknown>): void }

const number = (value: string | undefined, fallback: number, min: number, max: number, key: string) => {
  if (value === undefined || value === '') return fallback
  const parsed = Number(value); if (!Number.isInteger(parsed) || parsed < min || parsed > max) throw new Error(`invalid_${key}`)
  return parsed
}
const flag = (value: string | undefined) => value === 'true'
export function missionWorkerConfig(env: Record<string, string | undefined> = process.env): MissionWorkerConfig {
  const enabled = flag(env.MISSION_WORKERS_ENABLED)
  const config = { enabled, publisherEnabled: enabled && flag(env.MISSION_OUTBOX_PUBLISHER_ENABLED), consumerEnabled: enabled && flag(env.MISSION_CONSUMER_ENABLED), publishIntervalMs:number(env.MISSION_PUBLISH_INTERVAL_MS, 5_000, 100, 60_000, 'MISSION_PUBLISH_INTERVAL_MS'), maxPublishBatch:number(env.MISSION_MAX_PUBLISH_BATCH, 50, 1, 100, 'MISSION_MAX_PUBLISH_BATCH'), maxAttempts:number(env.MISSION_MAX_ATTEMPTS, 3, 1, 10, 'MISSION_MAX_ATTEMPTS'), leaseMs:number(env.MISSION_WORKER_LEASE_MS, 30_000, 1_000, 300_000, 'MISSION_WORKER_LEASE_MS'), heartbeatMs:number(env.MISSION_WORKER_HEARTBEAT_MS, 10_000, 100, 299_999, 'MISSION_WORKER_HEARTBEAT_MS'), queueWarningAgeMs:number(env.MISSION_QUEUE_WARNING_AGE_MS, 60_000, 1_000, 86_400_000, 'MISSION_QUEUE_WARNING_AGE_MS'), queueCriticalAgeMs:number(env.MISSION_QUEUE_CRITICAL_AGE_MS, 300_000, 1_000, 86_400_000, 'MISSION_QUEUE_CRITICAL_AGE_MS') }
  if (config.heartbeatMs >= config.leaseMs || config.queueWarningAgeMs > config.queueCriticalAgeMs) throw new Error('invalid_mission_worker_durations')
  if (enabled && !env.MISSION_REDIS_URL) throw new Error('mission_redis_required_when_workers_enabled')
  return config
}

export function createMissionWorkerRuntime(input: { config: MissionWorkerConfig; ports: MissionRuntimePorts; instanceId: string; now?: () => Date; logger?: MissionLogger }): MissionWorkerRuntime {
  const now = input.now ?? (() => new Date()); const logger = input.logger ?? { info() {}, warn() {} }
  let started = false; let stopping = false; let lease: MissionLease | undefined; let timer: ReturnType<typeof setTimeout> | undefined
  let running = false; let recovered = 0; let lastPublishAt: string | undefined; let lastErrorCode: string | undefined
  const tick = async () => { if (!started || stopping || running || !input.config.publisherEnabled) return; running = true
    try { lease = lease ? await input.ports.renewLease(lease, input.config.leaseMs) : await input.ports.acquireLease(input.instanceId, input.config.leaseMs)
      if (!lease) { lastErrorCode = 'lease_unavailable'; logger.warn('lease_lost'); return }
      recovered += await input.ports.recover(lease, input.config.maxPublishBatch)
      const published = await input.ports.publish(lease, input.config.maxPublishBatch); if (published) lastPublishAt = now().toISOString()
    } catch { lastErrorCode = 'runtime_iteration_failed'; logger.warn('runtime_iteration_failed') } finally { running = false; if (started && !stopping) timer = setTimeout(() => void tick(), input.config.publishIntervalMs) }
  }
  return {
    async start() { if (started) return; started = true; stopping = false; logger.info('runtime_started'); if (input.config.consumerEnabled) await input.ports.startConsumer?.(); if (input.config.publisherEnabled) await tick() },
    async stop() { if (!started || stopping) return; stopping = true; if (timer) clearTimeout(timer); while (running) await new Promise(resolve => setTimeout(resolve, 5)); if (input.config.consumerEnabled) await input.ports.stopConsumer?.(); if (lease) await input.ports.releaseLease(lease).catch(() => undefined); lease = undefined; started = false; stopping = false; logger.info('runtime_stopped') },
    async health() { const base = await input.ports.snapshot(); const generatedAt = now().toISOString(); const enabled = input.config.enabled
      let status: MissionRuntimeDiagnostics['status'] = !enabled ? 'disabled' : 'healthy'
      if (enabled && ((input.config.publisherEnabled && !lease) || (input.config.consumerEnabled && base.queueDepth > 0 && !started) || lastErrorCode || (base.oldestPendingAgeMs ?? 0) >= input.config.queueCriticalAgeMs)) status = 'critical'
      else if (base.deadLetterCount > 0 || (base.oldestPendingAgeMs ?? 0) >= input.config.queueWarningAgeMs) status = 'warning'
      return { ...base, generatedAt, runtimeEnabled:enabled, publisherEnabled:input.config.publisherEnabled, consumerEnabled:input.config.consumerEnabled, publisherOwner:lease?.owner, leaseExpiresAt:lease?.expiresAt, recoveredEvents:base.recoveredEvents + recovered, lastPublishAt:base.lastPublishAt ?? lastPublishAt, lastErrorCode:base.lastErrorCode ?? lastErrorCode, status }
    },
  }
}
