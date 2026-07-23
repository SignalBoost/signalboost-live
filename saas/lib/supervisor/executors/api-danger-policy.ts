// saas/lib/supervisor/executors/api-danger-policy.ts
//
// The danger line for the Self-Healing Supervisor's API executor.
//
// Doctrine (owner decision, 2026-07-22): the Supervisor auto-executes routine
// self-heal on its own — reads, verifies, env-var changes, redeploys, and other
// non-destructive provider calls. It must STOP and get the owner ONLY for the
// severe categories: money, destructive/irreversible actions, and credential or
// security changes.
//
// CRITICAL SAFETY PROPERTY: this classification is deterministic and hard-coded.
// It is NEVER delegated to the model whose diagnosis produced the plan — the whole
// point is a fixed gate the AI cannot argue its way past. It is also FAIL-SAFE:
// anything this module cannot confidently clear is treated as dangerous, so a new
// or unrecognized shape pauses for a human rather than executing unseen.

import type { RepairStep } from '../repair-plan-schema.ts'
import type { SerializableValue } from '../incident-schema.ts'

export type DangerCategory = 'financial' | 'destructive' | 'credential_security'

export interface DangerVerdict {
  dangerous: boolean
  category?: DangerCategory
  reason: string
}

// Money movement, billing, payments, spend. A wrong auto-execution here costs real money.
const FINANCIAL = /(stripe|billing|invoice|charge|payment|payout|refund|\bprice|pricing|subscription|budget|spend|checkout|\bwire\b|paypal|\bbank\b|\bach\b)/i

// Irreversible / destructive. A wrong auto-execution here cannot be undone.
const DESTRUCTIVE = /(delete|destroy|\bdrop\b|truncate|remove|purge|wipe|teardown|tear-down|disable|deactivate|revoke|uninstall|migrat|\bdns\b|domain|dealloc|deprovision)/i

// Credentials, secrets, auth, permissions. A wrong auto-execution here is a security event.
const CREDENTIAL_SECURITY = /(\bkey\b|apikey|api-key|token|secret|credential|password|passwd|oauth|\bauth|permission|\brole\b|\bgrant\b|\bscope\b|\biam\b|rotat|\bcert\b|certificate|private-?key)/i

// HTTP methods that mutate state, when carried on an api_request step's parameters.
const MUTATING_METHOD = /^(delete)$/i // DELETE is always destructive regardless of target

function collectText(step: RepairStep, targetProvider: string): string {
  const parts: string[] = [step.action, step.description || '', targetProvider || '']
  const p = step.parameters || {}
  for (const [k, v] of Object.entries(p)) {
    parts.push(k)
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') parts.push(String(v))
  }
  return parts.join(' ')
}

function methodOf(step: RepairStep): string {
  const m = (step.parameters || {}) as Record<string, SerializableValue>
  const raw = m.method ?? m.httpMethod ?? m.verb
  return typeof raw === 'string' ? raw.trim() : ''
}

/**
 * Classify a single repair step. Returns { dangerous: true, category } when the
 * step touches a severe category and must pause for the owner; { dangerous:false }
 * when it is safe to auto-execute. Fail-safe: on any doubt, dangerous.
 */
export function classifyStep(step: RepairStep, targetProvider: string): DangerVerdict {
  try {
    // A step the plan itself marked protected is treated as consequential input,
    // but protection alone does NOT force a pause — the owner chose to auto-run
    // routine protected work (env vars, redeploys). The severe categories below
    // are what pause. This keeps the gate on danger, not on the "protected" flag.
    const method = methodOf(step)

    // Intent text = the step's OWN action + description + parameters. The provider
    // name is checked separately below, so that e.g. a credential rotation on the
    // Stripe provider is categorized as credential_security (its real intent) and
    // not mislabeled financial merely because "stripe" appears in the target.
    const intent = collectText(step, '')
    const providerName = (targetProvider || '')

    if (MUTATING_METHOD.test(method)) {
      return { dangerous: true, category: 'destructive', reason: `Step uses a destructive HTTP method (${method.toUpperCase()}).` }
    }
    // Order by intent specificity: credential and destructive intents are more
    // specific than a bare financial-provider match, so they win the label.
    if (CREDENTIAL_SECURITY.test(intent)) {
      return { dangerous: true, category: 'credential_security', reason: 'Step touches credentials, secrets, auth, or permissions.' }
    }
    if (DESTRUCTIVE.test(intent)) {
      return { dangerous: true, category: 'destructive', reason: 'Step is destructive or irreversible (delete/disable/DNS/migration/etc.).' }
    }
    if (FINANCIAL.test(intent)) {
      return { dangerous: true, category: 'financial', reason: 'Step touches money, billing, or payments.' }
    }
    // Provider-level danger: even a benign-looking action on a money/credential/
    // destructive provider surface pauses, categorized by that provider's nature.
    if (FINANCIAL.test(providerName)) {
      return { dangerous: true, category: 'financial', reason: `Step runs against a financial provider (${providerName}).` }
    }
    if (CREDENTIAL_SECURITY.test(providerName)) {
      return { dangerous: true, category: 'credential_security', reason: `Step runs against a credential/security surface (${providerName}).` }
    }
    if (DESTRUCTIVE.test(providerName)) {
      return { dangerous: true, category: 'destructive', reason: `Step runs against a destructive-capable surface (${providerName}).` }
    }
    return { dangerous: false, reason: 'No severe-category match; safe to auto-execute.' }
  } catch (err) {
    // Fail safe: if we cannot classify it, we do not run it.
    return { dangerous: true, category: 'destructive', reason: `Could not classify step; pausing for safety (${err instanceof Error ? err.message : 'unknown error'}).` }
  }
}
