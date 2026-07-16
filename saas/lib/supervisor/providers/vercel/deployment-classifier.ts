import type { NormalizedDeploymentState, VercelDeployment, VercelEnvironment } from './vercel-types.ts'

const queued = new Set(['QUEUED', 'INITIALIZING'])
const building = new Set(['BUILDING', 'DEPLOYING', 'UPLOADING', 'BOOTED'])
const ready = new Set(['READY'])
const failed = new Set(['ERROR', 'FAILED'])
const canceled = new Set(['CANCELED', 'CANCELLED'])

export function normalizeDeploymentState(raw: unknown): NormalizedDeploymentState {
  const state = String(raw || '').trim().toUpperCase()
  if (queued.has(state)) return 'queued'
  if (building.has(state)) return 'building'
  if (ready.has(state)) return 'ready'
  if (failed.has(state)) return 'failed'
  if (canceled.has(state)) return 'canceled'
  return 'unknown'
}

export function normalizeEnvironment(deployment: VercelDeployment, fallback: VercelEnvironment): VercelEnvironment {
  const target = String(deployment.target || deployment.environment || fallback).toLowerCase()
  if (target === 'production' || target === 'prod') return 'production'
  if (target === 'preview') return 'preview'
  return 'sandbox'
}

export function timestampMs(value: number | string | null | undefined): number | undefined {
  if (typeof value === 'number') return value < 10_000_000_000 ? value * 1000 : value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Date.parse(value)
    if (!Number.isNaN(parsed)) return parsed
    const n = Number(value)
    if (Number.isFinite(n)) return n < 10_000_000_000 ? n * 1000 : n
  }
  return undefined
}

export function isStuck(deployment: VercelDeployment, nowMs: number, thresholdMs: number): boolean {
  const state = normalizeDeploymentState(deployment.state)
  if (state !== 'queued' && state !== 'building') return false
  const created = timestampMs(deployment.createdAt)
  return created !== undefined && nowMs - created >= thresholdMs
}
