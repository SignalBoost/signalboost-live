// saas/agent-gateway/classifier.ts
//
// The reference CONSEQUENCE CLASSIFIER — the piece the safety envelope was waiting on.
// Gate 1 in governance.ts asks one question of every request: what CLASS of consequence
// does this action carry? This module answers it.
//
// Four properties make it safe to put in front of a Fortune-500 security review:
//
//   1. CATEGORICAL, NOT SCORED. There is no confidence value, no probability, no risk
//      number anywhere in this file. A class is a fact about what an action can affect,
//      not a guess about how likely harm is. Nothing can be "confident enough" to make a
//      money-moving or life-affecting action unattended.
//   2. DETERMINISTIC AND PURE. Same request in, same class out, forever. No clock, no
//      network, no model call, no environment, no state. It can be replayed and audited.
//   3. ESCALATE-ONLY. When several rules match one action, the MOST severe class wins.
//      A rule can raise a class; no rule can ever lower one. That holds for buyer-supplied
//      rules too — a buyer can tighten this classifier but is structurally unable to
//      loosen it.
//   4. FAIL-CLOSED. High precision, deliberately low recall. Only actions that clearly
//      belong to a class are classified; everything else returns 'unknown', which
//      HUMAN_ONLY_CLASSES already routes to a human. Silence means "ask a person", never
//      "assume it's fine".
//
// Host-agnostic: names no platform, no vendor, and no protocol. It reads only the
// normalized AgentRequest, so it works identically for MCP, A2A, MAVLink, ROS 2, and every
// protocol added later.

import type { AgentRequest, ConsequenceClass, ConsequenceClassifier } from './types.ts'

// ---- Severity ordering (used ONLY to resolve multiple matches; never to decide alone) ----
// 'unknown' ranks highest on purpose: if any rule explicitly abstains, the request is
// human-gated even when another rule thought it was routine.
const SEVERITY_RANK: Readonly<Record<ConsequenceClass, number>> = {
  reversible_internal: 0,
  external_effect: 1,
  data_destructive: 2,
  financial: 3,
  safety: 4,
  unknown: 5,
}

/**
 * One classification rule. A rule fires when ANY of its tokens appears in the action's
 * kind/target, or ANY of its paramKeys appears among the action's parameter names.
 * Matching is on whole tokens, so 'pay' does not fire on 'paycheck_report'.
 */
export interface ClassificationRule {
  readonly id: string
  readonly consequenceClass: ConsequenceClass
  /** Whole tokens matched against the tokenized action kind + target. */
  readonly tokens?: readonly string[]
  /** Exact (case-insensitive) match on the whole target string. */
  readonly targets?: readonly string[]
  /** Whole tokens matched against the action's parameter KEY names (never values). */
  readonly paramKeys?: readonly string[]
}

/**
 * Split an identifier into lowercase word tokens. Handles snake_case, kebab-case,
 * dot.notation, camelCase and ACRONYMCase alike, so 'wireTransfer', 'wire_transfer',
 * 'NAV_LAND' and 'HTTPSend' all tokenize the way a reviewer would expect.
 */
export function tokenize(value: string): string[] {
  return value
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
}

// ---- The built-in rule set ----
// Exported so a buyer's security team can read, diff, and sign off on exactly what the
// classifier believes — an auditable artifact, not a black box. Each set is intentionally
// narrow: an ambiguous verb is left OUT so it falls through to 'unknown' and reaches a
// human, rather than being guessed at.
export const DEFAULT_CLASSIFICATION_RULES: readonly ClassificationRule[] = [
  // Life, health, and the physical world. Motion, actuation, and dosing commands.
  {
    id: 'builtin.safety.physical',
    consequenceClass: 'safety',
    tokens: [
      'land', 'takeoff', 'waypoint', 'navigate', 'steer', 'brake', 'throttle', 'thrust',
      'altitude', 'arm', 'disarm', 'motor', 'servo', 'actuator', 'gimbal', 'payload',
      'dock', 'undock', 'valve', 'dose', 'dosage', 'infusion', 'ventilator', 'defibrillator',
    ],
  },
  // Money movement in any direction.
  {
    id: 'builtin.financial.money',
    consequenceClass: 'financial',
    tokens: [
      'payment', 'payout', 'payroll', 'transfer', 'remittance', 'invoice', 'charge',
      'refund', 'chargeback', 'billing', 'wire', 'ach', 'settlement', 'disbursement',
      'purchase', 'checkout', 'subscription', 'ledger', 'withdraw', 'deposit',
    ],
    paramKeys: ['amount', 'amount_cents', 'currency', 'iban', 'account_number', 'card_number'],
  },
  // Irrecoverable or overwriting changes to stored data.
  {
    id: 'builtin.data.destructive',
    consequenceClass: 'data_destructive',
    tokens: [
      'delete', 'destroy', 'drop', 'truncate', 'purge', 'wipe', 'erase', 'overwrite',
      'revoke', 'expire',
    ],
  },
  // Anything the outside world can observe: messages, publications, third-party calls.
  {
    id: 'builtin.external.effect',
    consequenceClass: 'external_effect',
    tokens: [
      'send', 'email', 'sms', 'publish', 'post', 'tweet', 'broadcast', 'announce',
      'notify', 'webhook', 'dispatch', 'submit', 'share',
    ],
  },
  // Reversible internal operations — the ONLY class ever eligible for the allowlist.
  // Read-only inspection belongs here: it changes nothing and is trivially reversible.
  {
    id: 'builtin.reversible.internal',
    consequenceClass: 'reversible_internal',
    tokens: [
      'restart', 'reboot', 'rollback', 'requeue', 'retry', 'reindex', 'recompute',
      'telemetry', 'heartbeat', 'ping', 'healthcheck', 'status', 'diagnostics',
      'get', 'read', 'list', 'describe', 'inspect', 'fetch', 'query', 'lookup',
    ],
  },
  // Known-safe recovery maneuvers: the FDIR pattern — approve the playbook once, not the
  // incident. Matched on the WHOLE target so a generic token can never widen this.
  {
    id: 'builtin.reversible.safe_recovery',
    consequenceClass: 'reversible_internal',
    targets: ['RETURN_TO_LAUNCH', 'RETURN_TO_BASE', 'RTL', 'ABORT', 'HOLD', 'LOITER'],
  },
]

export interface ClassifierOptions {
  /**
   * Buyer-supplied rules, evaluated alongside the built-ins. Because merging is
   * escalate-only, these can only ever RAISE a classification — a buyer can teach the
   * gateway that their internal tool is dangerous, but cannot declare a dangerous action
   * routine.
   */
  readonly rules?: readonly ClassificationRule[]
  /** Replace the built-ins entirely. Escalate-only merging still applies. */
  readonly replaceDefaults?: boolean
}

function ruleMatches(rule: ClassificationRule, tokens: ReadonlySet<string>, target: string, paramKeys: ReadonlySet<string>): boolean {
  if (rule.targets?.some((t) => t.toLowerCase() === target.toLowerCase())) return true
  if (rule.tokens?.some((t) => tokens.has(t.toLowerCase()))) return true
  if (rule.paramKeys?.some((k) => paramKeys.has(k.toLowerCase()))) return true
  return false
}

/**
 * Build a classifier. Pass it as `policy.classifier` to evaluate()/runGoverned().
 *
 * Returns 'unknown' whenever no rule fires — governance.ts treats that as human-only, so
 * an unrecognized action is parked for a person instead of being executed.
 */
export function createConsequenceClassifier(options: ClassifierOptions = {}): ConsequenceClassifier {
  const rules: readonly ClassificationRule[] = options.replaceDefaults
    ? (options.rules ?? [])
    : [...DEFAULT_CLASSIFICATION_RULES, ...(options.rules ?? [])]

  return {
    classify(request: AgentRequest): ConsequenceClass {
      const action = request?.action
      // A malformed request is not a safe request.
      if (!action || typeof action.kind !== 'string' || typeof action.target !== 'string') {
        return 'unknown'
      }

      const tokens = new Set([...tokenize(action.kind), ...tokenize(action.target)])
      const paramKeys = new Set(
        Object.keys(action.params ?? {}).flatMap((k) => [k.toLowerCase(), ...tokenize(k)]),
      )

      let matched: ConsequenceClass | undefined
      for (const rule of rules) {
        if (!ruleMatches(rule, tokens, action.target, paramKeys)) continue
        // Escalate-only: keep the most severe class seen. Order of rules cannot downgrade.
        if (matched === undefined || SEVERITY_RANK[rule.consequenceClass] > SEVERITY_RANK[matched]) {
          matched = rule.consequenceClass
        }
      }

      return matched ?? 'unknown'
    },
  }
}

/** A ready-to-use classifier with the built-in rules only. */
export const defaultConsequenceClassifier: ConsequenceClassifier = createConsequenceClassifier()
