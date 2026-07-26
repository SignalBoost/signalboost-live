// saas/lib/cos/index.ts
// Public surface of the Chief-of-Staff gateway module.
export * from './contracts.ts'
export { HeuristicIntentRouter } from './intent-router.ts'
export { DefaultPlanResolver } from './plan-resolver.ts'
export { FixedCeilingBudgetPolicy, estimateTokens, SAFETY, MIN_USEFUL_TOKENS } from './budget-policy.ts'
export { DefaultContextAssembler } from './assembler.ts'
export { DefaultCosGateway, runEngineLoop } from './gateway.ts'
export * from './supervisor-thinker-prompt.ts'
