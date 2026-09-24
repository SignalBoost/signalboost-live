// saas/platform-harness/runtime/scheduled-ingress.ts
//
// Mandatory ingress for hosted scheduled/background execution. The route receives one bounded
// Production HarnessRun before any cron worker logic begins. Existing Harness context always wins,
// so a self-governed child/workflow cannot gain a sibling authority envelope.

import { withHostProductionHarnessIngress } from './host-ingress.ts'
import type { HarnessCapabilityRisk } from '../core/types.ts'

function cleanSlug(routePath: string): string {
  return routePath
    .replace(/^\/+|\/+$/g, '')
    .replace(/^api\/cron\//, '')
    .replace(/[^a-z0-9._-]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 160) || 'scheduled-worker'
}

function scheduledRisk(routePath: string): HarnessCapabilityRisk {
  return /(?:publish|send|dispatch|deploy|provision|repair|merge|activation|fine-tuning|voice|approval)/i.test(routePath)
    ? 'consequential'
    : 'write'
}

export async function withScheduledProductionHarnessIngress<T>(
  input: Readonly<{
    routePath: string
    objective?: string
    deadlineMs?: number
    maxToolCalls?: number
    maxConcurrency?: number
  }>,
  operation: () => Promise<T>,
): Promise<T> {
  const routePath = String(input.routePath || '').trim()
  if (!/^\/api\/cron\//.test(routePath)) throw new Error('scheduled_harness_route_path_invalid')
  const slug = cleanSlug(routePath)
  return withHostProductionHarnessIngress({
    objective: input.objective || `Execute scheduled route ${routePath}`,
    portableId: `scheduled-${slug}`,
    agentId: `scheduled-${slug}`,
    role: 'scheduled_worker',
    capabilityId: `scheduled.${slug}.execute`,
    risk: scheduledRisk(routePath),
    deadlineMs: input.deadlineMs ?? 600_000,
    maxToolCalls: input.maxToolCalls ?? 500,
    maxConcurrency: input.maxConcurrency ?? 8,
  }, operation)
}
