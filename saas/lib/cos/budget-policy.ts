// saas/lib/cos/budget-policy.ts
// ─────────────────────────────────────────────────────────────────────────────
// FixedCeilingBudgetPolicy: the v1 allocation math. Fully deterministic — given
// the same directives and budget, it returns the same allowances every time.
//
// Locked decisions:
//   • NO RECLAIM. Slack left by an underflowing source stays on the table so the
//     KB's retrieval bound never shifts with metrics payload size.
//   • 85% SAFETY PAD on the budget (token estimates drift from the real tokenizer;
//     exact tokenization is a deliberate future optimization).
//   • Hard ceilings: a source gets its full ceiling if it fits in priority order,
//     otherwise 0 — never a useless sliver.
//
// Priority order: required → preferred → optional, stable within each group by
// the directive array order the resolver produced. `required` is reserved first;
// if it alone exceeds budget that is a RESOLVER bug — we surface it (ok:false) so
// the assembler can fail loud rather than silently truncate load-bearing context.
// ─────────────────────────────────────────────────────────────────────────────
import type { BudgetPolicy, BudgetAllocation, ContextDirective, TurnContext } from './contracts'

export const SAFETY = 0.85           // budget to 85% of the ceiling
export const MIN_USEFUL_TOKENS = 64  // below this, an allowance is not worth the slot

/** chars/4 estimate — used by the assembler to fit blocks; padded by SAFETY here. */
export function estimateTokens(text: string): number {
  if (!text) return 0
  return Math.ceil(text.length / 4)
}

function ceilingFor(d: ContextDirective, effectiveBudget: number): number {
  if (typeof d.maxTokens === 'number') return Math.max(0, Math.floor(d.maxTokens))
  if (typeof d.weight === 'number') return Math.max(0, Math.floor(d.weight * effectiveBudget))
  return 0
}

export class FixedCeilingBudgetPolicy implements BudgetPolicy {
  id = 'fixed-ceiling-v1'

  allocate(directives: ContextDirective[], budgetTokens: number, _ctx: TurnContext): BudgetAllocation {
    const effectiveBudget = Math.floor(Math.max(0, budgetTokens) * SAFETY)
    const allowances: Record<string, number> = {}

    const groups = {
      required:  directives.filter(d => d.necessity === 'required'),
      preferred: directives.filter(d => d.necessity === 'preferred'),
      optional:  directives.filter(d => d.necessity === 'optional'),
    }

    let remaining = effectiveBudget

    // Phase 1 — reserve required in full. Overflow here is a resolver bug.
    let requiredSum = 0
    for (const d of groups.required) {
      const c = ceilingFor(d, effectiveBudget)
      allowances[d.sourceId] = c
      requiredSum += c
    }
    if (requiredSum > effectiveBudget) {
      return {
        ok: false,
        allowances,
        effectiveBudget,
        error: `required context (${requiredSum} tok) exceeds budget (${effectiveBudget} tok) — tighten the resolver's ceilings`,
      }
    }
    remaining -= requiredSum

    // Phases 2 & 3 — preferred then optional, each taking its full ceiling if it
    // fits in the remaining space (in stable order), else nothing. No reclaim.
    for (const group of [groups.preferred, groups.optional]) {
      for (const d of group) {
        const c = ceilingFor(d, effectiveBudget)
        const grant = c <= remaining && c >= MIN_USEFUL_TOKENS ? c : 0
        allowances[d.sourceId] = grant
        remaining -= grant
      }
    }

    return { ok: true, allowances, effectiveBudget }
  }
}
