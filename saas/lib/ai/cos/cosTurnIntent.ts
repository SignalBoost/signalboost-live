// saas/lib/ai/cos/cosTurnIntent.ts
//
// ONE INTENT DECISION PER COS TURN. The semantic task-intent judge (cosSemanticTaskIntent.ts) reads the whole request
// with its conversation and decides what the user wants. Before this, each step of a turn decided for itself, mostly
// with word rules: the browser front door, the writing setup inside COS and the live-lookup branch could each pick a
// different lane for the same request. Production 2026-10-28: one pasted cable plus a question about the user's
// retirement options was sent to the writing setup by one step and to the picture generator by another.
//
// A turn opens a scope (withCosTurnIntent); the first step that needs the judge's reading runs it, and every later
// step in the same turn receives that same reading. Outside a scope the judge simply runs.

import { AsyncLocalStorage } from 'node:async_hooks'
import { classifyCosSemanticTaskIntent, type CosSemanticTaskIntent } from './cosSemanticTaskIntent.ts'

type JudgeArgs = Readonly<{
  input: string
  language?: string | null
  previousUserContext?: string | null
  previousAssistant?: string | null
}>
type Judge = (args: JudgeArgs) => Promise<CosSemanticTaskIntent | null>

const turnScope = new AsyncLocalStorage<{ decision: Promise<CosSemanticTaskIntent | null> | null }>()

/** Run one COS turn. A turn nested in another (the browser front door calling COS) shares the outer decision. */
export function withCosTurnIntent<T>(run: () => Promise<T>): Promise<T> {
  if (turnScope.getStore()) return run()
  return turnScope.run({ decision: null }, run)
}

/** The judge's reading of this turn's request, decided once per turn. Null when the judge was unavailable or unsure. */
export function cosTurnIntent(args: JudgeArgs, run: Judge = classifyCosSemanticTaskIntent): Promise<CosSemanticTaskIntent | null> {
  const scope = turnScope.getStore()
  if (!scope) return run(args)
  scope.decision ??= run(args).catch(() => null)
  return scope.decision
}
