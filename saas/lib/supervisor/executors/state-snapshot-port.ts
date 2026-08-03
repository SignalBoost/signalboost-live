// saas/lib/supervisor/executors/state-snapshot-port.ts
//
// TRANSACTIONAL EXECUTION BOUNDARIES.
//
// A repair is not a sequence of individually undoable calls. It is a transaction: a clean
// state is captured, the change is applied, the result is verified, and if verification
// fails the execution context is returned to the captured state as ONE operation. The
// system never reasons about how to reverse step four; it restores the world to before
// step one existed.
//
// ─────────────────────────────────────────────────────────────────────────────
// THE PART THAT MAKES THIS SURVIVE CONTACT WITH A REAL ENTERPRISE
//
// No platform snapshots everything, and the ones that claim to are lying about the parts
// they cannot reach. A database has point-in-time recovery. A deployment has an immutable
// previous build. A cluster has a revision history. An email that has left the building
// has none of those, and neither does a captured payment or a webhook another company
// already received.
//
// So the boundary is not assumed, it is PROVEN, per plan, before anything runs. Every step
// is mapped to the state scope it touches; every scope is matched against a snapshot
// capability the buyer has registered. The plan is then one of exactly three things:
//
//   BOUNDED     every scope it touches is covered by a restorable snapshot. It executes
//               inside a transaction and a failed verification restores it atomically.
//
//   ISOLATED    it touches something no snapshot covers, but that something is confined —
//               a sandbox, a preview environment, a dry-run — so a failure escapes nothing.
//
//   UNBOUNDED   it touches an irreversible external effect with no snapshot and no
//               isolation. The platform does not execute it automatically. Not because
//               undo is hard, but because there is no such thing as undoing it: a refund
//               is a second payment, a correction email is a second email. Aerospace does
//               not undo a fired thruster either — it requires the crew to arm it first.
//
// "100% safe and reversible" is achieved by making the third category IMPOSSIBLE to enter
// unattended, not by pretending it does not exist. A platform that cannot tell a buyer
// which category a repair falls into before it runs has not earned the word transactional.

import type { SerializableValue } from '../incident-schema.ts'
import type { RepairPlan, RepairStep } from '../repair-plan-schema.ts'

export const snapshotSchemaVersion = 'supervisor-state-snapshot-v1'

/**
 * The kinds of state an enterprise can actually checkpoint. Each maps to mechanisms a
 * buyer already owns — this list exists so a buyer can say "our RDS covers `database`,
 * our Vercel covers `deployment`, nothing covers `external_effect`" and the platform can
 * reason about the answer.
 */
export const snapshotScopes = [
  'deployment',       // immutable previous build: Vercel alias, ECS task definition, AMI
  'database',         // point-in-time recovery, transaction, logical backup
  'configuration',    // env vars, feature flags, secrets versions, IaC state
  'container',        // pod revision, deployment rollout history, StatefulSet revision
  'filesystem',       // volume snapshot, EBS, object-store versioning
  'external_effect',  // NEVER restorable by definition — see below
] as const
export type SnapshotScope = (typeof snapshotScopes)[number]

/**
 * The scope that exists to be refused. An external effect is anything already observed by
 * a party outside the buyer's control: a sent message, a captured payment, a delivered
 * webhook, a published record. It is listed as a scope precisely so the planner can NAME
 * it in a refusal instead of silently classifying it as covered.
 */
export const IRREVERSIBLE_SCOPE: SnapshotScope = 'external_effect'

export interface StateSnapshotRef {
  snapshotId: string
  scope: SnapshotScope
  provider: string
  capturedAt: string
  /** False for a reference that exists but cannot be restored from — a log, an audit copy. */
  restorable: boolean
  /** After this, treat the snapshot as gone. Retention is the buyer's, not ours to assume. */
  expiresAt?: string
  metadata?: Record<string, SerializableValue>
}

export interface SnapshotCapability {
  scope: SnapshotScope
  provider: string
  /**
   * True when restoring returns the whole scope to the captured state in one operation.
   * False for a mechanism that replays or reconciles — usable, but the planner will not
   * call a plan BOUNDED on it, because a partial replay is the fragility we are leaving.
   */
  atomicRestore: boolean
  /** Rough restore time. A snapshot that takes an hour is not a rollback, it is a recovery plan. */
  estimatedRestoreSeconds?: number
}

export interface SnapshotCaptureResult { ok: boolean; snapshot?: StateSnapshotRef; error?: string }
export interface SnapshotRestoreResult { ok: boolean; restoredAt?: string; error?: string }

/**
 * Supplied by the buyer, once, for infrastructure they already run. This is the entire
 * integration surface for transactional repair — three methods, no platform assumptions
 * about what is underneath. RDS, Vercel, Kubernetes, Terraform state, a filesystem
 * snapshot service: all of them satisfy this in well under a hundred lines.
 */
export interface StateSnapshotPort {
  capabilities(): readonly SnapshotCapability[] | Promise<readonly SnapshotCapability[]>
  capture(input: { scope: SnapshotScope; provider: string; environment: string; reason: string }): Promise<SnapshotCaptureResult> | SnapshotCaptureResult
  restore(snapshot: StateSnapshotRef): Promise<SnapshotRestoreResult> | SnapshotRestoreResult
  /** Optional cleanup once an incident closes. Snapshots cost money; leaking them is rude. */
  release?(snapshot: StateSnapshotRef): Promise<void> | void
}

// ─────────────────────────────────────────────────────────────────────────────
// SCOPE INFERENCE
//
// Which state does a step touch? A step declares it explicitly via parameters.stateScope
// when the buyer's planner is scope-aware. When it does not, the text is classified — and
// UNRECOGNISED TEXT RESOLVES TO external_effect, never to a covered scope. An unknown
// action is treated as the most dangerous thing it could be, so a classifier gap produces
// a refusal rather than an unprotected execution.

const SCOPE_PATTERNS: ReadonlyArray<{ scope: SnapshotScope; pattern: RegExp }> = Object.freeze([
  { scope: 'external_effect', pattern: /\b(email|sms|notify|notification|webhook|publish|broadcast|send|charge|refund|payment|invoice|payout|transfer|message)\b/i },
  { scope: 'deployment', pattern: /\b(deploy|deployment|build|release|rollout|alias|promote|revert.?build)\b/i },
  { scope: 'database', pattern: /\b(database|db|sql|query|migration|table|row|record|schema|transaction)\b/i },
  { scope: 'configuration', pattern: /\b(config|configuration|env|environment.?variable|flag|setting|secret|variable)\b/i },
  { scope: 'container', pattern: /\b(container|pod|replica|scale|restart|deployment\.apps|statefulset|service)\b/i },
  { scope: 'filesystem', pattern: /\b(file|volume|disk|bucket|object|storage|blob)\b/i },
])

export function inferStateScope(step: RepairStep): SnapshotScope {
  const declared = step.parameters?.stateScope
  if (typeof declared === 'string' && (snapshotScopes as readonly string[]).includes(declared)) {
    return declared as SnapshotScope
  }
  const text = `${step.action} ${step.description} ${JSON.stringify(step.parameters || {})}`
  // Order matters: external_effect is tested first so "send a notification after the
  // deploy" is classified by its irreversible half, not its reversible one.
  for (const entry of SCOPE_PATTERNS) if (entry.pattern.test(text)) return entry.scope
  return IRREVERSIBLE_SCOPE
}

// ─────────────────────────────────────────────────────────────────────────────
// THE BOUNDARY PLAN

export type BoundaryClassification = 'bounded' | 'isolated' | 'unbounded'

export interface ScopeRequirement {
  scope: SnapshotScope
  stepIds: string[]
  covered: boolean
  atomic: boolean
  reason: string
}

export interface TransactionBoundaryPlan {
  classification: BoundaryClassification
  requirements: ScopeRequirement[]
  /** Scopes that must be captured before execution begins. */
  scopesToCapture: SnapshotScope[]
  uncoveredScopes: SnapshotScope[]
  summary: string
  schemaVersion: string
}

/** Environments where an unrestorable change escapes nothing. */
const ISOLATED_ENVIRONMENTS = Object.freeze(['sandbox', 'preview'])

export function planTransactionBoundary(
  plan: RepairPlan,
  capabilities: readonly SnapshotCapability[],
): TransactionBoundaryPlan {
  const byScope = new Map<SnapshotScope, string[]>()
  for (const step of plan.steps || []) {
    // Read-only steps change nothing, so they need no snapshot and must not drag a scope
    // into the capture set. Verification steps are excluded for the same reason.
    if (step.action === 'read' || step.action === 'screenshot' || step.action === 'verify' || step.action === 'stop') continue
    const scope = inferStateScope(step)
    byScope.set(scope, [...(byScope.get(scope) || []), step.stepId])
  }

  const isolated = ISOLATED_ENVIRONMENTS.includes(plan.targetEnvironment)
  const requirements: ScopeRequirement[] = []

  for (const [scope, stepIds] of byScope) {
    if (scope === IRREVERSIBLE_SCOPE) {
      requirements.push({
        scope, stepIds, covered: false, atomic: false,
        reason: 'Effects observed outside your systems cannot be restored — reversing one creates a second real event.',
      })
      continue
    }
    const capability = capabilities.find(item => item.scope === scope && item.provider === plan.targetProvider)
      || capabilities.find(item => item.scope === scope)
    if (!capability) {
      requirements.push({ scope, stepIds, covered: false, atomic: false, reason: `No snapshot capability is registered for ${scope}.` })
      continue
    }
    requirements.push({
      scope, stepIds, covered: true, atomic: capability.atomicRestore,
      reason: capability.atomicRestore
        ? `${capability.provider} provides an atomic restore for ${scope}.`
        : `${capability.provider} can restore ${scope}, but not as a single atomic operation.`,
    })
  }

  const uncovered = requirements.filter(item => !item.covered)
  const nonAtomic = requirements.filter(item => item.covered && !item.atomic)

  let classification: BoundaryClassification
  let summary: string
  if (!requirements.length) {
    classification = 'bounded'
    summary = 'The plan changes no state, so it is trivially reversible.'
  } else if (!uncovered.length && !nonAtomic.length) {
    classification = 'bounded'
    summary = `Every scope this plan touches (${requirements.map(r => r.scope).join(', ')}) has an atomic snapshot. A failed verification restores the whole context in one operation.`
  } else if (isolated) {
    classification = 'isolated'
    summary = `Not every scope is snapshot-covered, but the target environment is ${plan.targetEnvironment}, so a failure escapes nothing.`
  } else {
    classification = 'unbounded'
    const names = [...uncovered.map(r => r.scope), ...nonAtomic.map(r => r.scope)].join(', ')
    summary = `This plan touches ${names} in ${plan.targetEnvironment} with no atomic snapshot behind it, so it is not automatically reversible.`
  }

  return Object.freeze({
    classification,
    requirements,
    scopesToCapture: requirements.filter(item => item.covered).map(item => item.scope),
    uncoveredScopes: uncovered.map(item => item.scope),
    summary,
    schemaVersion: snapshotSchemaVersion,
  })
}
