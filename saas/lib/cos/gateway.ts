// saas/lib/cos/gateway.ts
// ─────────────────────────────────────────────────────────────────────────────
// The reference orchestrator. It composes the seams — router → resolver →
// assembler → engine (+ shared tool loop) — over INJECTED dependencies. It does
// not import or touch the live support route; it is the boundary the route will
// delegate to once we move execution code. Proving it compiles proves the
// architecture composes.
//
// `runEngineLoop` is the single DRY tool loop. Each engine supplies its own
// LoopPolicy (round caps + time budget), which the resolver may tighten — so the
// loop is shared but its behavior is per-engine, exactly as locked.
// ─────────────────────────────────────────────────────────────────────────────
import type {
  CosGateway, CosReply, TurnContext,
  IntentRouter, PlanResolver, ContextAssembler,
  EngineRegistry, ToolRegistry, PromptStrategyRegistry,
  ReasoningEngine, EngineInput, LoopPolicy, ChatMessage, ExecutionPlan,
} from './contracts'

interface LoopOutcome {
  text: string
  toolRounds: number
  timedOut: boolean
}

export async function runEngineLoop(args: {
  engine: ReasoningEngine
  input: EngineInput
  loop: LoopPolicy
  tools: ToolRegistry
  plan: ExecutionPlan
  ctx: TurnContext
  forceFirstAction?: boolean
}): Promise<LoopOutcome> {
  const { engine, tools, plan, ctx, loop } = args
  const started = Date.now()
  const remaining = () => loop.budgetMs - (Date.now() - started)

  const messages: ChatMessage[] = [...args.input.messages]
  let rounds = 0
  let timedOut = false

  let result = await engine.run({
    ...args.input,
    messages,
    toolChoice: args.forceFirstAction ? 'required' : args.input.toolChoice,
    budgetMs: loop.budgetMs,
  })
  if (result.finishReason === 'timeout') timedOut = true

  while (
    !timedOut &&
    result.toolCalls.length > 0 &&
    rounds < loop.maxToolRounds &&
    remaining() > loop.remainingFloorMs
  ) {
    rounds++

    // Record the assistant's tool-call turn, then each tool's result.
    messages.push({ role: 'assistant', content: result.text ?? '' })
    for (const call of result.toolCalls) {
      const out = await tools.dispatch(call, plan, ctx)
      messages.push({ role: 'tool', toolCallId: out.callId, content: out.content })
    }

    result = await engine.run({
      ...args.input,
      messages,
      toolChoice: 'auto',
      budgetMs: Math.max(loop.remainingFloorMs, remaining()),
    })
    if (result.finishReason === 'timeout') { timedOut = true; break }
  }

  return { text: (result.text ?? '').trim(), toolRounds: rounds, timedOut }
}

export class DefaultCosGateway implements CosGateway {
  constructor(
    private readonly router: IntentRouter,
    private readonly resolver: PlanResolver,
    private readonly assembler: ContextAssembler,
    private readonly engines: EngineRegistry,
    private readonly tools: ToolRegistry,
    private readonly prompts: PromptStrategyRegistry,
  ) {}

  async handle(ctx: TurnContext): Promise<CosReply> {
    const intent = await this.router.classify(ctx)
    const plan = this.resolver.resolve(intent, ctx)

    const engine = this.engines.get(plan.engineId)
    if (!engine) {
      return this.fail(intent, plan.engineId, `engine "${plan.engineId}" is not registered`)
    }

    const promptStrategy = this.prompts.get(plan.promptStrategyId)
    if (!promptStrategy) {
      return this.fail(intent, plan.engineId, `prompt strategy "${plan.promptStrategyId}" is not registered`)
    }

    const assembled = await this.assembler.assemble(plan, ctx)
    if (!assembled.ok) {
      return this.fail(intent, plan.engineId, assembled.error || 'context assembly failed')
    }

    const system = promptStrategy.render(plan, ctx, assembled)
    const toolSpecs = this.tools.specsFor(plan, ctx)
    const loop: LoopPolicy = { ...engine.defaultLoopPolicy, ...(plan.loopPolicyOverride || {}) }

    const outcome = await runEngineLoop({
      engine,
      input: {
        system,
        messages: [{ role: 'system', content: system }, ...ctx.turn.messages],
        tools: toolSpecs,
        toolChoice: 'auto',
        budgetMs: loop.budgetMs,
      },
      loop,
      tools: this.tools,
      plan,
      ctx,
    })

    return {
      ok: true,
      text: outcome.text,
      intent,
      engineId: plan.engineId,
      droppedContext: assembled.dropped,
      toolRounds: outcome.toolRounds,
      timedOut: outcome.timedOut,
    }
  }

  private fail(intent: CosReply['intent'], engineId: string, error: string): CosReply {
    return { ok: false, text: '', intent, engineId, droppedContext: [], toolRounds: 0, timedOut: false, error }
  }
}
