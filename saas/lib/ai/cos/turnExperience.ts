// saas/lib/ai/cos/turnExperience.ts
//
// Per-turn execution telemetry for COS metacognitive learning.
//
// This is deliberately NOT factual learning. It records what kind of question arrived, which
// optional reasoning phases ran or were skipped, and how much wall-clock time those phases cost.
// Outcome evidence is attached separately so a future routing policy can compare cost against
// verified quality instead of learning from latency alone.

export type TurnPhaseKind = 'model' | 'orchestration'

export type TurnQueryFeatures = {
  wordCount: number
  avgWordLength: number
  isLookup: boolean
  hasComparison: boolean
  hasMultiHop: boolean
  hasCode: boolean
  hasMath: boolean
}

export type TurnPhase = {
  phase: string
  kind: TurnPhaseKind
  ms: number
  ok: boolean
}

export type TurnSkip = {
  phase: string
  reason: string
}

export type TurnExperience = {
  turnId: string
  promptHash: string
  problemClass: string
  features: TurnQueryFeatures
  reasonerLabel: string
  phases: TurnPhase[]
  skipped: TurnSkip[]
  totalMs: number
  modelCallMs: number
  otherMs: number
  modelCalls: number
  answered: boolean
}

function words(text: string): string[] {
  return String(text ?? '')
    .trim()
    .split(/\s+/)
    .map(value => value.trim())
    .filter(Boolean)
}

export function extractQueryFeatures(prompt: string): TurnQueryFeatures {
  const normalized = String(prompt ?? '').replace(/\s+/g, ' ').trim()
  const tokens = words(normalized)
  const lower = normalized.toLowerCase()
  const letters = tokens.reduce((sum, token) => sum + token.replace(/[^a-z0-9]/gi, '').length, 0)

  const isLookup = /^(what is|what are|who is|who are|when is|when was|where is|where are|define\b|meaning of\b)/i.test(normalized)
    && tokens.length <= 20
  const hasComparison = /\b(compare|comparison|difference|different from|versus|\bvs\.?\b|better than|worse than|trade-?off)\b/i.test(normalized)
  const hasCode = /```|\b(import|function|class|const|let|var|def|async|await|typescript|javascript|python|sql|source code|write a program|write code)\b/i.test(normalized)
  const hasMath = /\b(calculate|compute|equation|formula|percentage|percent|p\d{2}|median|mean|average|standard deviation|variance)\b/i.test(normalized)
    || /\d+\s*[%+\-*/=]\s*\d+/.test(normalized)
  const conjunctions = (lower.match(/\b(and|then|while|given|because|therefore|without)\b/g) || []).length
  const hasMultiHop = tokens.length >= 24 && conjunctions >= 2
    || /\b(distinguish|root cause|likely causes|mechanism|falsif|given that|while .* and)\b/i.test(normalized)

  return {
    wordCount: tokens.length,
    avgWordLength: tokens.length ? letters / tokens.length : 0,
    isLookup,
    hasComparison,
    hasMultiHop,
    hasCode,
    hasMath,
  }
}

export function surfaceDifficulty(features: TurnQueryFeatures): 'easy' | 'medium' | 'hard' {
  if (features.hasCode || features.hasMath || features.hasMultiHop || features.wordCount >= 60) return 'hard'
  if (features.isLookup && !features.hasComparison && features.wordCount <= 20) return 'easy'
  return 'medium'
}

export class TurnRecorder {
  private readonly startedAt: number
  private readonly now: () => number
  private readonly phaseRows: TurnPhase[] = []
  private readonly skipRows: TurnSkip[] = []

  constructor(now: () => number = Date.now) {
    this.now = now
    this.startedAt = this.now()
  }

  async time<T>(
    phase: string,
    operation: () => Promise<T>,
    kind: TurnPhaseKind = 'orchestration',
  ): Promise<T> {
    const startedAt = this.now()
    let ok = false
    try {
      const value = await operation()
      ok = value !== null && value !== undefined && value !== false
      return value
    } finally {
      this.phaseRows.push({
        phase: String(phase || 'unknown'),
        kind,
        ms: Math.max(0, this.now() - startedAt),
        ok,
      })
    }
  }

  skip(phase: string, reason: string): void {
    this.skipRows.push({
      phase: String(phase || 'unknown'),
      reason: String(reason || 'unknown'),
    })
  }

  snapshot(args: {
    turnId: string
    promptHash: string
    problemClass: string
    features: TurnQueryFeatures
    reasonerLabel: string
    answered: boolean
  }): TurnExperience {
    const totalMs = Math.max(0, this.now() - this.startedAt)
    const modelPhases = this.phaseRows.filter(row => row.kind === 'model')
    const modelCallMs = modelPhases.reduce((sum, row) => sum + row.ms, 0)

    return {
      turnId: args.turnId,
      promptHash: args.promptHash,
      problemClass: String(args.problemClass || 'general reasoning'),
      features: args.features,
      reasonerLabel: args.reasonerLabel,
      phases: [...this.phaseRows],
      skipped: [...this.skipRows],
      totalMs,
      // These values are exact for direct model phases instrumented by callCosReasoner. Council and
      // challenge may themselves contain more than one provider request, so this is intentionally a
      // lower bound until provider-boundary request correlation is added.
      modelCallMs,
      otherMs: Math.max(0, totalMs - modelCallMs),
      modelCalls: modelPhases.length,
      answered: args.answered,
    }
  }
}
