// saas/lib/supervisor/executors/api-danger-policy.ts
//
// Classification is default-deny. Model-written descriptions and keyword
// matches may help label a paused action, but they never authorize execution.
// An API request is automatic only when the buyer's explicit capability
// registry validates its provider, action, method, resource and parameters.

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

/**
 * Read/verify control steps are intrinsically non-mutating. Every api_request
 * must match the explicit registry. Everything unknown pauses.
 */
export function classifyStep(
  step: RepairStep,
  targetProvider: string,
  registry: ApiCapabilityRegistry = emptyApiCapabilityRegistry,
): DangerVerdict {
  try {
    if (step.action === 'read' || step.action === 'verify' || step.action === 'stop') {
      return { dangerous: false, reason: `Built-in ${step.action} step is non-mutating.` }
    }
    if (step.action === 'request_approval') {
      return { dangerous: true, category: categoryFor(step, targetProvider), reason: 'Step explicitly requests human approval.' }
    }
    if (step.action !== 'api_request') {
      return { dangerous: true, category: categoryFor(step, targetProvider), reason: `Action ${step.action} is not auto-executable by the API executor.` }
    }

    const match = registry.match(step, targetProvider)
    if (!match.allowed) {
      return {
        dangerous: true,
        category: categoryFor(step, targetProvider),
        reason: match.reason,
        capabilityMatch: match,
      }
    }
    return {
      dangerous: false,
      reason: match.reason,
      capabilityMatch: match,
    }
  } catch (error) {
    return {
      dangerous: true,
      category: categoryFor(step, targetProvider),
      reason: `Could not validate API capability; pausing for safety (${error instanceof Error ? error.message : 'unknown error'}).`,
    }
  }
}
