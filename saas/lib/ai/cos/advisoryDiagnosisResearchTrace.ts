import { createHash } from 'node:crypto'
import { stripInternalEvidenceIds } from './answerEvidenceIdHygiene.ts'
import { correctCompoundingArithmetic } from './compoundingArithmeticCheck.ts'
import { resolveCalcMarkers } from './calcExpressions.ts'
import type { PublishedDiagnosticReference } from './advisoryDiagnosisPolicy.ts'

export type AdvisoryDiagnosisResearchTrace = {
  attempted: boolean
  references: PublishedDiagnosticReference[]
  errors: string[]
}

type StoredTrace = AdvisoryDiagnosisResearchTrace & { at: number }

const traces = new Map<string, StoredTrace>()
const TRACE_TTL_MS = 10 * 60 * 1000
const MAX_TRACES = 128

function userVisibleAnswer(text: string): string {
  const calculated = resolveCalcMarkers(String(text || '')).text
  return correctCompoundingArithmetic(stripInternalEvidenceIds(calculated)).text
    .replace(/\s+/g, ' ')
    .trim()
}

function keyOf(text: string): string {
  return createHash('sha256').update(userVisibleAnswer(text)).digest('hex')
}

function purge(now = Date.now()): void {
  for (const [key, trace] of traces) {
    if (now - trace.at > TRACE_TTL_MS) traces.delete(key)
  }
  while (traces.size > MAX_TRACES) {
    const oldest = traces.keys().next().value
    if (!oldest) break
    traces.delete(oldest)
  }
}

export function recordAdvisoryDiagnosisResearchForAnswer(
  answer: string,
  trace: AdvisoryDiagnosisResearchTrace,
): void {
  if (!trace.attempted) return
  const key = keyOf(answer)
  if (!key) return
  purge()
  traces.set(key, {
    at: Date.now(),
    attempted: true,
    references: (trace.references || []).slice(0, 4).map(reference => ({ ...reference })),
    errors: (trace.errors || []).slice(0, 4).map(error => String(error).slice(0, 240)),
  })
}

/**
 * Consumed exactly when server-owned answer provenance is assembled. The key is the cleaned
 * user-visible answer, so internal [KG#]/[CL#]/[SK#] scaffolding never has to leak into the reply.
 * Consumption prevents an unrelated later turn with coincidentally identical prose from inheriting
 * stale research lineage.
 */
export function consumeAdvisoryDiagnosisResearchForAnswer(answer: string): AdvisoryDiagnosisResearchTrace | null {
  purge()
  const key = keyOf(answer)
  const stored = traces.get(key)
  if (!stored) return null
  traces.delete(key)
  return {
    attempted: stored.attempted,
    references: stored.references.map(reference => ({ ...reference })),
    errors: [...stored.errors],
  }
}
