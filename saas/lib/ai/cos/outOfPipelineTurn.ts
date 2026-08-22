import { randomUUID } from 'node:crypto'

export type OutOfPipelineTurn = {
  prompt: string
  answered: boolean
  confidence: number
  branch: string
}

/** Ensure provenance, the client response, and its experience row share one turn id. */
export function ensureProvenanceTurnId(provenance: unknown): string | null {
  if (!provenance || typeof provenance !== 'object' || Array.isArray(provenance)) return null
  const record = provenance as Record<string, unknown>
  const existing = typeof record.turnId === 'string' ? record.turnId.trim() : ''
  if (existing) return existing
  const minted = randomUUID()
  record.turnId = minted
  return minted
}

/** Minimal, factual telemetry for a response that bypassed the ordinary reasoning pipeline. */
export function buildOutOfPipelineExperienceRow(
  turnId: string,
  turn: OutOfPipelineTurn,
  hashPromptFn: (prompt: string) => string,
): Record<string, unknown> {
  const confidence = Number.isFinite(Number(turn.confidence)) ? Math.max(0, Math.min(1, Number(turn.confidence))) : 0
  return {
    turn_id: turnId,
    prompt_hash: hashPromptFn(String(turn.prompt || '')),
    problem_class: 'out_of_pipeline',
    features: {},
    surface_difficulty: 'unknown',
    reasoner_label: `cos_primary:${String(turn.branch || 'unknown').slice(0, 60)}`,
    phases: [],
    skipped: [],
    total_ms: 0,
    model_call_ms: 0,
    other_ms: 0,
    model_calls: 0,
    answered: turn.answered === true,
    confidence,
    confidence_threshold: null,
    draft_survived_unrepaired: null,
  }
}
