// saas/lib/ai/cos/evidenceSourceUse.ts
//
// WHICH LEARNED-CORPUS SOURCE KINDS ACTUALLY GET CITED.
//
// This turns injected-but-unused context into a measurable acquisition signal. A zero citation rate
// is not automatically a bug: COS is explicitly told not to cite evidence that did not materially
// affect the answer. Source-kind utilization is therefore evidence for prompt-budget/acquisition
// review, never an automatic trust or suppression decision.

export type SourceKindUse = {
  sourceKind: string
  injected: number
  cited: number
}

export type EvidenceUse = {
  injected: number
  cited: number
  bySourceKind: SourceKindUse[]
}

const UNKNOWN_SOURCE_KIND = 'unknown'

function cleanSourceKind(value: unknown): string {
  const kind = String(value ?? '').trim().toLowerCase()
  return /^[a-z0-9_-]+$/.test(kind) ? kind : UNKNOWN_SOURCE_KIND
}

/**
 * Attribute citations to structured selected source kinds. `citedIndices` are 1-based ([CL1] -> 1).
 * Out-of-range/hallucinated citations are ignored, and citing the same item twice counts once.
 */
export function attributeSourceKinds(sourceKinds: readonly string[], citedIndices: readonly number[]): EvidenceUse {
  const kinds = Array.isArray(sourceKinds) ? sourceKinds.map(cleanSourceKind) : []
  const counts = new Map<string, { injected: number; cited: number }>()
  for (const kind of kinds) {
    const entry = counts.get(kind) ?? { injected: 0, cited: 0 }
    entry.injected += 1
    counts.set(kind, entry)
  }

  const seen = new Set<number>()
  let cited = 0
  for (const raw of citedIndices) {
    const index = Math.floor(Number(raw))
    if (!Number.isFinite(index) || index < 1 || index > kinds.length || seen.has(index)) continue
    seen.add(index)
    cited += 1
    const kind = kinds[index - 1]
    const entry = counts.get(kind) ?? { injected: 0, cited: 0 }
    entry.cited += 1
    counts.set(kind, entry)
  }

  return {
    injected: kinds.length,
    cited,
    bySourceKind: [...counts.entries()]
      .map(([sourceKind, entry]) => ({ sourceKind, injected: entry.injected, cited: entry.cited }))
      .sort((a, b) => b.injected - a.injected || a.sourceKind.localeCompare(b.sourceKind)),
  }
}

/**
 * Legacy/parser helper retained for diagnostics and regression tests. Runtime attribution uses the
 * structured source_kind captured before prompt rendering, so formatting changes cannot silently
 * corrupt the production measurement.
 */
export function sourceKindFromEvidenceLine(line: string): string {
  const text = String(line ?? '')
  const lastOpen = text.lastIndexOf('[')
  if (lastOpen < 0) return UNKNOWN_SOURCE_KIND
  const block = text.slice(lastOpen + 1).replace(/\]\s*$/, '')
  const parts = block.split(';').map(part => part.trim()).filter(Boolean)
  const tail = parts[parts.length - 1] ?? ''
  return cleanSourceKind(tail.split(/\s+/)[0] ?? '')
}

export function attributeCitations(evidenceLines: readonly string[], citedIndices: readonly number[]): EvidenceUse {
  return attributeSourceKinds(evidenceLines.map(sourceKindFromEvidenceLine), citedIndices)
}

export type SourceKindVerdict =
  | 'insufficient_evidence'
  | 'never_cited'
  | 'low_utilization'
  | 'useful'
  | 'high_value'

export type SourceKindRollup = {
  sourceKind: string
  injected: number
  cited: number
  /** null below the sample minimum — a rate from a handful of injections is not a rate. */
  citedRate: number | null
  verdict: SourceKindVerdict
}

export const MINIMUM_INJECTIONS_FOR_VERDICT = 20
/** Operational buckets only; they are not automatic source-trust or admission policy. */
export const LOW_UTILIZATION_RATE = 0.10
export const HIGH_VALUE_RATE = 0.40

export function sourceKindVerdict(
  injected: number,
  cited: number,
  minimumInjections = MINIMUM_INJECTIONS_FOR_VERDICT,
): SourceKindVerdict {
  const safeInjected = Math.max(0, Math.floor(Number(injected) || 0))
  const safeCited = Math.max(0, Math.min(safeInjected, Math.floor(Number(cited) || 0)))
  if (safeInjected < minimumInjections) return 'insufficient_evidence'
  if (safeCited === 0) return 'never_cited'
  const rate = safeCited / safeInjected
  if (rate < LOW_UTILIZATION_RATE) return 'low_utilization'
  if (rate >= HIGH_VALUE_RATE) return 'high_value'
  return 'useful'
}

export function rollupSourceKindUse(
  uses: readonly EvidenceUse[],
  minimumInjections = MINIMUM_INJECTIONS_FOR_VERDICT,
): SourceKindRollup[] {
  const totals = new Map<string, { injected: number; cited: number }>()
  for (const use of uses) {
    for (const entry of use?.bySourceKind ?? []) {
      const kind = cleanSourceKind(entry.sourceKind)
      const total = totals.get(kind) ?? { injected: 0, cited: 0 }
      total.injected += Number(entry.injected) || 0
      total.cited += Number(entry.cited) || 0
      totals.set(kind, total)
    }
  }

  return [...totals.entries()]
    .map(([sourceKind, total]) => {
      const enough = total.injected >= minimumInjections
      return {
        sourceKind,
        injected: total.injected,
        cited: total.cited,
        citedRate: enough ? Number((total.cited / total.injected).toFixed(4)) : null,
        verdict: sourceKindVerdict(total.injected, total.cited, minimumInjections),
      }
    })
    .sort((a, b) => b.injected - a.injected || a.sourceKind.localeCompare(b.sourceKind))
}
