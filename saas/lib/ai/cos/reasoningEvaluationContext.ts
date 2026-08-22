import { AsyncLocalStorage } from 'node:async_hooks'
import type { CosReasoningWorkerRole } from '@/lib/ai/cos/cosReasoningControlPlane'

export type CosReasoningEvaluationContext = {
  source: 'controlled_comparison'
  runId: string
  candidateId: string
  workerRole: CosReasoningWorkerRole
}

const evaluationContext = new AsyncLocalStorage<CosReasoningEvaluationContext>()

function clean(value: unknown, max = 120): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

export function normalizeReasoningEvaluationContext(input: CosReasoningEvaluationContext): CosReasoningEvaluationContext {
  const runId = clean(input.runId)
  const candidateId = clean(input.candidateId)
  if (!runId || !candidateId) throw new Error('Controlled COS comparison requires runId and candidateId.')
  return {
    source: 'controlled_comparison',
    runId,
    candidateId,
    workerRole: input.workerRole,
  }
}

export function withReasoningEvaluationContext<T>(
  input: CosReasoningEvaluationContext,
  operation: () => Promise<T>,
): Promise<T> {
  return evaluationContext.run(normalizeReasoningEvaluationContext(input), operation)
}

export function currentReasoningEvaluationContext(): CosReasoningEvaluationContext | null {
  return evaluationContext.getStore() ?? null
}
