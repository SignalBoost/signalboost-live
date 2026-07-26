// saas/lib/supervisor/portable/static-approver-directory.ts
//
// A REFERENCE ApproverDirectory. Until now the portable shipped the `ApproverDirectory`
// interface and nothing behind it, so a buyer could not stand the supervisor up at all
// without first writing an IdP integration. That put their acceptance run — detect, pause,
// notify, approve, execute — behind a project rather than an afternoon.
//
// This is the implementation they use on day one: an explicit, validated mapping from
// danger category to the people who may approve it. It is also what the portable's own
// acceptance harness runs against, so the reference is exercised rather than decorative.
//
// It is NOT a replacement for their IdP. A real deployment resolves approvers from Okta,
// Entra, or an on-call rota so that leavers and rotations are reflected automatically. The
// contract is one method, so swapping this for that adapter is a one-line change.
//
// Host-agnostic by construction: names no platform, reads no environment, imports nothing
// but the boundary types it implements. Enforced by
// tests/supervisorPortableHostContext.node.test.ts, which permits no exceptions anywhere
// under lib/supervisor/portable/.

import type { Approver, ApproverDirectory, PortableNotification } from './host-context.ts'

type Category = PortableNotification['category']

const CATEGORIES: readonly Category[] = Object.freeze(['financial', 'destructive', 'credential_security'])

export interface StaticApproverDirectoryConfig {
  /** Who may approve a step that moves money or changes spend. */
  financial?: readonly Approver[]
  /** Who may approve a step that deletes, overwrites, or takes something offline. */
  destructive?: readonly Approver[]
  /** Who may approve a step that touches credentials, keys, or access. */
  credential_security?: readonly Approver[]
  /**
   * Used for any category left unset. Supplying this is a deliberate decision that one
   * group may approve everything — without it, every category must be listed explicitly.
   */
  fallback?: readonly Approver[]
}

/** Thrown at construction, never during an incident. */
export class ApproverDirectoryConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ApproverDirectoryConfigError'
  }
}

function validateApprovers(category: string, approvers: readonly Approver[]): readonly Approver[] {
  if (!Array.isArray(approvers) || approvers.length === 0) {
    throw new ApproverDirectoryConfigError(`${category}: at least one approver is required`)
  }
  const ids = new Set<string>()
  for (const approver of approvers) {
    if (!approver || typeof approver.id !== 'string' || approver.id.trim() === '') {
      throw new ApproverDirectoryConfigError(`${category}: every approver needs a non-empty id`)
    }
    if (typeof approver.address !== 'string' || approver.address.trim() === '') {
      throw new ApproverDirectoryConfigError(`${category}: approver "${approver.id}" needs a non-empty address to route to`)
    }
    if (ids.has(approver.id)) {
      throw new ApproverDirectoryConfigError(`${category}: duplicate approver id "${approver.id}"`)
    }
    ids.add(approver.id)
  }
  return Object.freeze(approvers.map(a => Object.freeze({ ...a })))
}

/**
 * Build a directory from an explicit category-to-approver mapping.
 *
 * FAILS CLOSED AT WIRING TIME, not at 3am. Every category must resolve to at least one
 * approver, either directly or through `fallback`. A missing category is a configuration
 * mistake, and the moment to discover it is deployment — not the moment a destructive step
 * has already paused and the notification has nobody to address.
 *
 * The returned directory is synchronous and total: `approversFor` cannot throw and cannot
 * return empty, so the notifier's delivery path has no failure mode of its own.
 */
export function createStaticApproverDirectory(config: StaticApproverDirectoryConfig): ApproverDirectory {
  if (!config || typeof config !== 'object') {
    throw new ApproverDirectoryConfigError('a configuration object is required')
  }

  const fallback = config.fallback ? validateApprovers('fallback', config.fallback) : undefined
  const resolved = new Map<Category, readonly Approver[]>()

  const missing: Category[] = []
  for (const category of CATEGORIES) {
    const explicit = config[category]
    if (explicit) {
      resolved.set(category, validateApprovers(category, explicit))
    } else if (fallback) {
      resolved.set(category, fallback)
    } else {
      missing.push(category)
    }
  }

  if (missing.length > 0) {
    throw new ApproverDirectoryConfigError(
      `no approvers configured for: ${missing.join(', ')}. ` +
      'Set each category explicitly, or set `fallback` to accept that one group approves everything.',
    )
  }

  return Object.freeze({
    approversFor(category: Category): readonly Approver[] {
      // Unknown category cannot happen through the typed contract, but a JavaScript caller
      // could still reach here — resolve rather than return nothing, so a paused step is
      // never left unaddressed.
      return resolved.get(category) ?? fallback ?? resolved.get('destructive')!
    },
  }) as ApproverDirectory
}

/** The categories a directory must cover, exported so a buyer's own adapter can assert on them. */
export const APPROVER_CATEGORIES = CATEGORIES
