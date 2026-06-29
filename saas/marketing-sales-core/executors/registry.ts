// saas/marketing-sales-core/executors/registry.ts
// Self-registration registry, same pattern as console-core/defaultHost.
import type { PublishExecutor } from './types'

const REGISTRY = new Map<string, PublishExecutor>()

export function registerExecutor(ex: PublishExecutor): void {
  REGISTRY.set(ex.id, ex)
}
export function resolveExecutor(id: string): PublishExecutor | null {
  return REGISTRY.get(id) || null
}
export function listExecutors(): PublishExecutor[] {
  return Array.from(REGISTRY.values())
}
export function listPublishable(): PublishExecutor[] {
  return listExecutors().filter((e) => e.capabilities.publish)
}
