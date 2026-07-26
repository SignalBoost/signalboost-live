// saas/portable-license/guard.ts
//
// Wires the entitlement gate to a portable WITHOUT editing that portable.
//
// The gate has to be called at the point of execution, but every portable's
// execution surface has a different shape. Rather than cut a licence check into
// each one — eleven edits, eleven merge conflicts, eleven chances to remove it
// by accident — this wraps whatever object a portable already exposes and gates
// the methods you name.
//
// The wiring is one line at the place the portable is constructed:
//
//   const dispatcher = guardWithEntitlement(createSupervisorDispatcher(host), {
//     gate: entitlement,
//     classify: {
//       dispatch: { actionClass: 'dispatch', feature: 'repair.dispatch' },
//       execute:  { actionClass: 'execute',  feature: 'repair.dispatch' },
//       status:   { actionClass: 'read' },
//     },
//     onRefusal: (event) => host.audit.emit(event),
//   });
//
// Two things to know before you use it.
//
// 1. A GUARDED METHOD RETURNS A PROMISE, because verification is asynchronous.
//    Only name methods that are already async, or whose callers await them.
//
// 2. A METHOD YOU DO NOT NAME IS NOT GUARDED. That is deliberate — silently
//    gating something the wirer never considered is how a licence check becomes
//    an outage. `strict: true` inverts it: anything unnamed is treated as
//    'execute' and refused when unlicensed. Use strict for a surface you have
//    fully enumerated.

import { EntitlementError, type PortableActionClass } from './types.ts';
import type { EntitlementGate } from './enforce.ts';

export interface GuardedMethod {
  actionClass: PortableActionClass;
  /** Optional named capability the licence must include. */
  feature?: string;
}

/** An audit record of a refusal. Safe to log: it carries no token. */
export interface EntitlementRefusal {
  kind: 'entitlement.refused';
  method: string;
  actionClass: PortableActionClass;
  feature: string | null;
  state: string;
  licenseId: string | null;
  reason: string;
  at: string;
}

export interface GuardOptions {
  gate: EntitlementGate;
  /** Method name → how to classify it. */
  classify: Record<string, PortableActionClass | GuardedMethod>;
  /** Treat unnamed methods as 'execute' instead of leaving them ungated. */
  strict?: boolean;
  /**
   * Called on every refusal, before the error is thrown. Wire this to your
   * audit sink: a refused execution is exactly the kind of event a buyer's
   * security team expects to see. Must not throw; if it does, the throw is
   * swallowed so monitoring cannot become the outage.
   */
  onRefusal?(event: EntitlementRefusal): void;
}

function normalize(entry: PortableActionClass | GuardedMethod): GuardedMethod {
  return typeof entry === 'string' ? { actionClass: entry } : entry;
}

/**
 * Returns a proxy over `target`. Named methods are gated; everything else —
 * unnamed methods, plain properties, getters — passes through untouched.
 */
export function guardWithEntitlement<T extends object>(target: T, options: GuardOptions): T {
  const { gate, classify, strict = false, onRefusal } = options;

  if (!target || typeof target !== 'object') {
    throw new Error('guardWithEntitlement: target must be an object.');
  }
  if (!gate || typeof gate.assertEntitled !== 'function') {
    throw new Error('guardWithEntitlement: gate must be an EntitlementGate.');
  }

  const wrapped = new Map<string, (...args: unknown[]) => Promise<unknown>>();

  function report(event: EntitlementRefusal) {
    if (!onRefusal) return;
    try {
      onRefusal(event);
    } catch {
      // A refusal that could not be recorded is still a refusal.
    }
  }

  return new Proxy(target, {
    get(obj, prop, receiver) {
      const value = Reflect.get(obj, prop, receiver);
      if (typeof prop !== 'string' || typeof value !== 'function') return value;

      const declared = Object.prototype.hasOwnProperty.call(classify, prop);
      if (!declared && !strict) return value;

      const rule = declared ? normalize(classify[prop]) : { actionClass: 'execute' as const };

      const cached = wrapped.get(prop);
      if (cached) return cached;

      const guarded = async function (this: unknown, ...args: unknown[]) {
        const result = await gate.check(prop, rule.actionClass, rule.feature);
        if (!result.allowed) {
          report({
            kind: 'entitlement.refused',
            method: prop,
            actionClass: rule.actionClass,
            feature: rule.feature ?? null,
            state: result.verdict.state,
            licenseId: result.verdict.claims?.licenseId ?? null,
            reason: result.reason,
            at: result.verdict.checkedAt,
          });
          throw new EntitlementError({
            message: `"${prop}" was not executed. ${result.reason}`,
            state: result.verdict.state,
            action: prop,
            actionClass: rule.actionClass,
            licenseId: result.verdict.claims?.licenseId ?? null,
          });
        }
        // `this` is the proxy when called as a method, so the underlying
        // implementation still sees the object it expects.
        return (value as (...a: unknown[]) => unknown).apply(this ?? obj, args);
      };

      Object.defineProperty(guarded, 'name', { value: prop });
      wrapped.set(prop, guarded);
      return guarded;
    },
  }) as T;
}

/**
 * Names in `classify` that the target does not actually have. Call this at
 * wiring time: a typo'd method name is a control that silently does nothing,
 * which is worse than no control at all.
 */
export function unmatchedGuards(target: object, classify: Record<string, unknown>): string[] {
  return Object.keys(classify).filter((name) => typeof (target as Record<string, unknown>)[name] !== 'function');
}
