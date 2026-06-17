// saas/lib/cos/assembler.ts
// ─────────────────────────────────────────────────────────────────────────────
// DefaultContextAssembler: turns a plan's directives into the final, budget-fitted
// context. It asks the BudgetPolicy for hard allowances, then loads each source
// WITHIN its allowance (the KB retrieves bounded by maxTokens — that is what
// breaks the retrieve-vs-budget chicken-and-egg). Loading is fail-soft per source;
// every drop is recorded with a reason for observability. The one fail-LOUD case
// is `required` context overflowing budget — surfaced, never silently truncated.
// ─────────────────────────────────────────────────────────────────────────────
import type {
  ContextAssembler, AssembledContext, ExecutionPlan, TurnContext,
  ContextSourceRegistry, BudgetPolicy, ContextBlock, DroppedRecord,
} from './contracts'
import { estimateTokens } from './budget-policy'

export class DefaultContextAssembler implements ContextAssembler {
  constructor(
    private readonly sources: ContextSourceRegistry,
    private readonly budget: BudgetPolicy,
  ) {}

  async assemble(plan: ExecutionPlan, ctx: TurnContext): Promise<AssembledContext> {
    const alloc = this.budget.allocate(plan.contextDirectives, plan.contextBudgetTokens, ctx)
    if (!alloc.ok) {
      // Fail loud: a load-bearing source could not fit. Do not proceed silently.
      return { ok: false, blocks: [], totalTokens: 0, dropped: [], error: alloc.error }
    }

    const blocks: ContextBlock[] = []
    const dropped: DroppedRecord[] = []
    let total = 0

    // Stable order = the resolver's directive order, so output is reproducible.
    for (const directive of plan.contextDirectives) {
      const allowance = alloc.allowances[directive.sourceId] ?? 0
      if (allowance <= 0) {
        dropped.push({ sourceId: directive.sourceId, reason: 'budget', wantedTokens: directive.maxTokens })
        continue
      }

      const source = this.sources.get(directive.sourceId)
      if (!source) {
        dropped.push({ sourceId: directive.sourceId, reason: 'error' })
        continue
      }

      if (!source.appliesTo(plan, ctx)) continue   // intentionally N/A this turn

      try {
        const block = await source.load(ctx, allowance)
        if (!block) {
          dropped.push({ sourceId: directive.sourceId, reason: 'empty' })
          continue
        }
        const fitted = this.enforceCeiling(block, allowance)
        blocks.push(fitted)
        total += fitted.tokensEstimate
      } catch {
        // Fail-soft: one bad source never sinks the turn.
        dropped.push({ sourceId: directive.sourceId, reason: 'error' })
      }
    }

    return { ok: true, blocks, totalTokens: total, dropped }
  }

  // A well-behaved source stays within allowance; this is the backstop for one
  // that does not, keeping the global budget honest. Truncation is deterministic.
  private enforceCeiling(block: ContextBlock, allowance: number): ContextBlock {
    const est = estimateTokens(block.body)
    if (est <= allowance) {
      return { ...block, tokensEstimate: est }
    }
    const charCap = allowance * 4
    const body = block.body.slice(0, charCap) + '\n…[truncated to fit budget]'
    return { ...block, body, tokensEstimate: estimateTokens(body) }
  }
}
