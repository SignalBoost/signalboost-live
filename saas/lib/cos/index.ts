// saas/lib/cos/index.ts
// Public surface of the Chief-of-Staff gateway module.
export * from './contracts'
export { HeuristicIntentRouter } from './intent-router'
export { DefaultPlanResolver } from './plan-resolver'
export { FixedCeilingBudgetPolicy, estimateTokens, SAFETY, MIN_USEFUL_TOKENS } from './budget-policy'
export { DefaultContextAssembler } from './assembler'
export { DefaultCosGateway, runEngineLoop } from './gateway'
