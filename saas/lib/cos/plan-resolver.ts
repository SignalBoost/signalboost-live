// saas/lib/cos/plan-resolver.ts
// ─────────────────────────────────────────────────────────────────────────────
// DefaultPlanResolver: maps Intent → ExecutionPlan. PURE — no I/O, no model call,
// no clock. Same intent + same principal ⇒ identical plan (so it is testable and
// debuggable).
//
// Locked decisions encoded here:
//   • MIXED is the default and fails OPEN — high-reasoning engine + FULL tools,
//     KB and metrics both `preferred` so the assembler arbitrates under budget.
//   • Necessity is DYNAMIC per intent (metrics are `required` on execute but only
//     `preferred` on advise; the KB is `required` on advise, light elsewhere).
//   • Fixed, hard token ceilings per source per intent (no reclaim downstream).
//
// PERMISSION is separate from INTENT: intent fails open toward capability, but a
// non-privileged principal is still forced onto the advisory-safe tool policy —
// which is exactly what makes advisory mode sellable to non-owner tiers.
// ─────────────────────────────────────────────────────────────────────────────
import type { PlanResolver, Intent, TurnContext, ExecutionPlan } from './contracts'

// Stable identifiers the registries resolve to concrete impls.
const ENGINE_FAST = 'fast'                  // e.g. gpt-4o-mini — quick execution turns
const ENGINE_HIGH = 'high-reasoning'        // e.g. gpt-4o / o-series — advisory + mixed

const TOOLS_EXECUTE = 'execute-all'         // full execution toolset
const TOOLS_PRIVILEGED = 'privileged-all'   // full toolset incl. infra PRs (mixed)
const TOOLS_ADVISORY = 'advisory-safe'      // read/reason only — no destructive tools

const PROMPT_COS = 'chief-of-staff'
const PROMPT_ADVISOR = 'cto-advisor'

export class DefaultPlanResolver implements PlanResolver {
  resolve(intent: Intent, ctx: TurnContext): ExecutionPlan {
    const plan = this.byIntent(intent)
    // Permission gate is orthogonal to intent. Non-privileged ⇒ no execution,
    // regardless of how the turn was classified.
    if (!ctx.principal.privileged) {
      plan.toolPolicyId = TOOLS_ADVISORY
    }
    return plan
  }

  private byIntent(intent: Intent): ExecutionPlan {
    switch (intent.kind) {
      // ── Execute: fast engine, metrics load-bearing, KB light. ──────────────
      case 'execute':
        return {
          engineId: ENGINE_FAST,
          toolPolicyId: TOOLS_EXECUTE,
          promptStrategyId: PROMPT_COS,
          contextBudgetTokens: 4000,
          contextDirectives: [
            { sourceId: 'live-metrics', necessity: 'required',  maxTokens: 1800 },
            { sourceId: 'user-memory',  necessity: 'preferred', maxTokens: 600 },
            { sourceId: 'conversation', necessity: 'optional',  maxTokens: 600 },
            { sourceId: 'strategy-kb',  necessity: 'optional',  maxTokens: 400 },
          ],
        }

      // ── Advise: high-reasoning engine, KB load-bearing, tools off. ─────────
      case 'advise':
        return {
          engineId: ENGINE_HIGH,
          toolPolicyId: TOOLS_ADVISORY,
          promptStrategyId: PROMPT_ADVISOR,
          contextBudgetTokens: 8000,
          contextDirectives: [
            { sourceId: 'strategy-kb',  necessity: 'required',  maxTokens: 4000 },
            { sourceId: 'live-metrics', necessity: 'preferred', maxTokens: 1200 },
            { sourceId: 'user-memory',  necessity: 'preferred', maxTokens: 600 },
            { sourceId: 'conversation', necessity: 'optional',  maxTokens: 800 },
          ],
        }

      // ── Mixed (DEFAULT, fail-open): high-reasoning + FULL tools; KB and ────
      //    metrics both `preferred` so neither pre-empts the other — the
      //    assembler decides under budget, not the resolver.
      case 'mixed':
      default:
        return {
          engineId: ENGINE_HIGH,
          toolPolicyId: TOOLS_PRIVILEGED,
          promptStrategyId: PROMPT_COS,
          contextBudgetTokens: 6000,
          contextDirectives: [
            { sourceId: 'live-metrics', necessity: 'preferred', maxTokens: 2000 },
            { sourceId: 'strategy-kb',  necessity: 'preferred', maxTokens: 2600 },
            { sourceId: 'user-memory',  necessity: 'preferred', maxTokens: 600 },
            { sourceId: 'conversation', necessity: 'optional',  maxTokens: 600 },
          ],
        }
    }
  }
}
