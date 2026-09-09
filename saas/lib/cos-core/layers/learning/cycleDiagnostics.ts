export type LearningGapDiagnostic = {
  subject: string
  documentsAcquired: number
  accepted: number
  probationary: number
  rejected: Record<string, number>
  sourceErrors: Record<string, number>
}

export type LearningGapDiagnostics = Record<string, LearningGapDiagnostic>

function clean(value: unknown, max = 240): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

export function initializeLearningGapDiagnostics(
  gaps: readonly Readonly<{ id: string; subject?: string }>[],
): LearningGapDiagnostics {
  const diagnostics: LearningGapDiagnostics = {}
  for (const gap of gaps) {
    const id = clean(gap.id, 300)
    if (!id || diagnostics[id]) continue
    diagnostics[id] = {
      subject: clean(gap.subject, 200),
      documentsAcquired: 0,
      accepted: 0,
      probationary: 0,
      rejected: {},
      sourceErrors: {},
    }
  }
  return diagnostics
}

export function learningGapDiagnostic(
  diagnostics: LearningGapDiagnostics,
  gapId: string,
): LearningGapDiagnostic | null {
  return diagnostics[clean(gapId, 300)] ?? null
}

export function incrementDiagnosticCount(
  counts: Record<string, number>,
  key: string,
  amount = 1,
): void {
  const normalized = clean(key, 160)
  if (!normalized) return
  counts[normalized] = Math.max(0, Math.floor(Number(counts[normalized] || 0))) + Math.max(0, Math.floor(Number(amount || 0)))
}
