// saas/lib/supervisor/executors/api-danger-policy.ts
//
// Classification is default-deny. Model-written descriptions, action labels and
// keyword matches may help label a paused action, but they never authorize
// execution. Every provider-bound read, verify or mutation must match the
// buyer's explicit capability registry.

import type { RepairStep } from '../repair-plan-schema.ts'
import {
  emptyApiCapabilityRegistry,
  type ApiCapabilityRegistry,
  type ApiCapabilityMatch,
} from './api-capability-registry.ts'

export type DangerCategory = 'financial' | 'destructive' | 'credential_security'

export interface DangerVerdict {
  dangerous: boolean
  category?: DangerCategory
  reason: string
  capabilityMatch?: ApiCapabilityMatch
}

const FINANCIAL = /(stripe|billing|invoice|charge|payment|payout|refund|price|pricing|subscription|budget|spend|checkout|wire|paypal|bank|ach)/i
const CREDENTIAL_SECURITY = /(key|apikey|api-key|token|secret|credential|password|passwd|oauth|auth|permission|role|grant|scope|iam|rotat|cert|certificate|private-?key|administrator)/i

function deepText(value: unknown, output: string[]): void {
  if (value == null) return
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    output.push(String(value))
    return
  }
  if (Array.isArray(value)) {
    for (const entry of value) deepText(entry, output)
    return
  }
  if (typeof value === 'object') {
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      output.push(key)
      deepText(nested, output)
    }
  }
}

function categoryFor(step: RepairStep, provider: string): DangerCategory {
  const parts: string[] = [step.action, step.description || '', provider || '']
  deepText(step.parameters || {}, parts)
  const text = parts.join(' ')
  if (CREDENTIAL_SECURITY.test(text)) return 'credential_security'
  if (FINANCIAL.test(text)) return 'financial'
  return 'destructive'
}

function paused(step: RepairStep, provider: string, reason: string, capabilityMatch?: ApiCapabilityMatch): DangerVerdict {
  return {
    dangerous: true,
    category: categoryFor(step, provider),
    reason,
    ...(capabilityMatch ? { capabilityMatch } : {}),
  }
}

export function classifyStep(
  step: RepairStep,
  targetProvider: string,
  registry: ApiCapabilityRegistry = emptyApiCapabilityRegistry,
): DangerVerdict {
  try {
    if (step.action === 'stop') {
      return { dangerous: false, reason: 'Built-in stop step performs no provider call.' }
    }
    if (step.action === 'request_approval') {
      return paused(step, targetProvider, 'Step explicitly requests human approval.')
    }
    if (!['api_request', 'read', 'verify'].includes(step.action)) {
      return paused(step, targetProvider, `Action ${step.action} is not executable by the API executor.`)
    }

    const match = registry.match(step, targetProvider)
    if (!match.allowed) return paused(step, targetProvider, match.reason, match)

    const capability = match.capability
    if (!capability) return paused(step, targetProvider, 'No registered capability matched the provider call.', match)

    if (step.action === 'read' || step.action === 'verify') {
      if (capability.mutation) {
        return paused(step, targetProvider, `${step.action} label cannot authorize a mutating capability.`, match)
      }
      if (capability.riskClass !== 'read_only') {
        return paused(step, targetProvider, `${step.action} requires a read-only capability.`, match)
      }
      if (!['GET', 'HEAD'].includes(match.method)) {
        return paused(step, targetProvider, `${step.action} requires GET or HEAD, not ${match.method}.`, match)
      }
    }

    return {
      dangerous: false,
      reason: match.reason,
      capabilityMatch: match,
    }
  } catch (error) {
    return paused(
      step,
      targetProvider,
      `Could not validate API capability; pausing for safety (${error instanceof Error ? error.message : 'unknown error'}).`,
    )
  }
}
