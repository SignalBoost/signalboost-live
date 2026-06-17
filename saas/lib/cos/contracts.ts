// saas/lib/cos/contracts.ts
// ─────────────────────────────────────────────────────────────────────────────
// Chief-of-Staff Gateway — the type contracts. One source of truth for the
// polymorphic boundary. Every concrete piece (engines, context sources, the
// knowledge base, routers, resolvers, budget policies) implements an interface
// here and nothing else depends on its internals.
//
// Design law: the REQUEST is dumb; the SERVER decides everything. The client may
// pass an optional `preferredMode` hint — the router MAY honor it, never must.
// ─────────────────────────────────────────────────────────────────────────────

// ── Primitives ───────────────────────────────────────────────────────────────

export type Role = 'owner' | 'admin' | 'member' | 'guest'

/** Resolved server-side from the session. Never trusted from the client body. */
export interface Principal {
  userId: string | null
  email: string | null
  role: Role
  privileged: boolean        // owner/admin — the only principals execution tools unlock for
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  toolCallId?: string
  name?: string
}

/** One normalized turn, provider-agnostic. */
export interface Turn {
  messages: ChatMessage[]
  latestUserText: string
  locale: string
  surface: string            // the page the user is on — a hint, not authority
  conversationId: string | null
}

/** Optional, untrusted hints. The demoted `mode`: advisory, never controlling. */
export interface RequestSignals {
  preferredMode?: IntentKind
}

export interface TurnContext {
  principal: Principal
  turn: Turn
  signals: RequestSignals
}

// ── Intent ───────────────────────────────────────────────────────────────────

export type IntentKind = 'execute' | 'advise' | 'mixed'

export interface Intent {
  kind: IntentKind
  confidence: number         // 0..1 — low confidence fails open to `mixed`
  rationale: string          // logged for observability, never shown to the user
}

/** Swappable classifier. v1 is a cheap heuristic; a model classifier slots in later. */
export interface IntentRouter {
  classify(ctx: TurnContext): Promise<Intent>
}

// ── Execution plan ───────────────────────────────────────────────────────────

export type Necessity = 'required' | 'preferred' | 'optional'

/**
 * The resolver's marching order for ONE context source. It declares intent about
 * context; it never loads it. `necessity` answers "can this be dropped under
 * pressure?"; `weight`/`maxTokens` answer "how much space does it get?".
 */
export interface ContextDirective {
  sourceId: string
  necessity: Necessity
  weight?: number            // 0..1 — share of budget when maxTokens is absent
  maxTokens?: number         // hard ceiling for this source (preferred over weight)
}

/** Pure output of the PlanResolver. Names ids; the gateway resolves ids to impls. */
export interface ExecutionPlan {
  engineId: string
  toolPolicyId: string
  promptStrategyId: string
  contextBudgetTokens: number              // ceiling for ALL context blocks combined
  contextDirectives: ContextDirective[]
  loopPolicyOverride?: Partial<LoopPolicy>  // resolver may tighten the engine default
}

/** Deterministic: same intent + same principal ⇒ same plan. No I/O, no clock. */
export interface PlanResolver {
  resolve(intent: Intent, ctx: TurnContext): ExecutionPlan
}

// ── Reasoning engine ─────────────────────────────────────────────────────────

/** Loop behavior varies by engine: o-series thinks for minutes, gpt-4o seconds. */
export interface LoopPolicy {
  maxToolRounds: number
  budgetMs: number
  remainingFloorMs: number   // stop starting new rounds below this remaining time
}

export interface ToolCall {
  id: string
  name: string
  argumentsJson: string
}

export interface EngineInput {
  system: string
  messages: ChatMessage[]
  tools: ToolSpec[]
  toolChoice: 'auto' | 'required' | 'none'
  budgetMs: number
}

export interface EngineResult {
  text: string | null
  toolCalls: ToolCall[]
  finishReason: 'stop' | 'tool_calls' | 'timeout' | 'length'
}

/** gpt-4o today, an o-series advisory model tomorrow — same interface, swapped impl. */
export interface ReasoningEngine {
  id: string
  defaultLoopPolicy: LoopPolicy
  run(input: EngineInput): Promise<EngineResult>
}

export interface EngineRegistry {
  get(id: string): ReasoningEngine | null
}

// ── Context sources + knowledge base ─────────────────────────────────────────

export interface ContextBlock {
  sourceId: string
  title: string
  body: string
  tokensEstimate: number
}

/**
 * Live metrics, user memory, conversation history, AND the strategy KB are all
 * just ContextSources. `load` receives the hard token allowance the assembler
 * granted and MUST stay within it.
 */
export interface ContextSource {
  id: string
  appliesTo(plan: ExecutionPlan, ctx: TurnContext): boolean
  load(ctx: TurnContext, maxTokens: number): Promise<ContextBlock | null>   // fail-soft
}

export interface RetrieveOpts {
  maxTokens: number          // STRICT — accumulate ranked chunks until hit, then stop
  topK?: number
}

export interface KnowledgeChunk {
  text: string
  source: string             // provenance — the moat lives here
  version: string            // KB content is versioned from day one
  retrievedAt: string
}

/** The strategy KB: a retrieval-shaped ContextSource with provenance + versioning. */
export interface KnowledgeBase extends ContextSource {
  retrieve(query: string, opts: RetrieveOpts): Promise<KnowledgeChunk[]>
}

export interface ContextSourceRegistry {
  get(id: string): ContextSource | null
}

// ── Budget policy + assembler ────────────────────────────────────────────────

export interface BudgetAllocation {
  ok: boolean
  allowances: Record<string, number>   // sourceId → hard token allowance
  effectiveBudget: number              // after the safety pad
  error?: string                       // set if `required` sources exceed budget
}

/** Swappable math. v1 = fixed ceilings, no reclaim, fully deterministic. */
export interface BudgetPolicy {
  id: string
  allocate(directives: ContextDirective[], budgetTokens: number, ctx: TurnContext): BudgetAllocation
}

export interface DroppedRecord {
  sourceId: string
  reason: 'budget' | 'empty' | 'error'
  wantedTokens?: number
}

export interface AssembledContext {
  ok: boolean
  blocks: ContextBlock[]
  totalTokens: number
  dropped: DroppedRecord[]   // observability: what got cut and why
  error?: string             // set on a fail-loud condition (required overflow)
}

export interface ContextAssembler {
  assemble(plan: ExecutionPlan, ctx: TurnContext): Promise<AssembledContext>
}

// ── Tools ────────────────────────────────────────────────────────────────────

export interface ToolSpec {
  id: string
  description: string
  parameters: unknown        // JSON schema
}

export interface ToolResult {
  callId: string
  content: string
}

/** Resolved by id from the plan; gates by principal at call time. */
export interface ToolRegistry {
  specsFor(plan: ExecutionPlan, ctx: TurnContext): ToolSpec[]
  dispatch(call: ToolCall, plan: ExecutionPlan, ctx: TurnContext): Promise<ToolResult>
}

// ── Prompt strategy ──────────────────────────────────────────────────────────

/** chiefOfStaffPrompt / conciergePrompt become PromptStrategy impls. */
export interface PromptStrategy {
  id: string
  render(plan: ExecutionPlan, ctx: TurnContext, assembled: AssembledContext): string
}

export interface PromptStrategyRegistry {
  get(id: string): PromptStrategy | null
}

// ── Gateway ──────────────────────────────────────────────────────────────────

export interface CosReply {
  ok: boolean
  text: string
  intent: Intent
  engineId: string
  droppedContext: DroppedRecord[]
  toolRounds: number
  timedOut: boolean
  error?: string
}

/** The single seam the route handler calls. Everything above composes behind it. */
export interface CosGateway {
  handle(ctx: TurnContext): Promise<CosReply>
}
