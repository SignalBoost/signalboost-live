// saas/lib/ai/cos/learnedEvidenceClass.ts
//
// WHY CORPUS CITATIONS STAY AT ZERO.
//
// The learning kernel deliberately admits two classes of retained knowledge (see
// `evidenceClass` in lib/cos-core/layers/learning/cycle.ts):
//
//   • FULL      — real content: documentation pages, transcripts, article bodies. Citable.
//   • METADATA  — discovery records: journal abstracts, catalogue entries, titles + one line.
//                 Admitted at a lower floor with confidence capped at 0.7, because knowing a
//                 paper EXISTS is useful even though the paper's content was never retrieved.
//
// That distinction is sound at write time and was then thrown away at read time. Retrieval ranked
// purely by similarity and injected the top 6 rows with an identical `[CLn]` label, so a 161-char
// abstract stub arrived looking exactly like a full document. With ~86 of 101 rows being abstracts,
// every injection slot went to material that contains nothing citable — and the reasoner, correctly
// refusing to cite what it cannot verify, cited none of them. Zero citations was the honest output
// of a retrieval bug, not a model failure.
//
// This module restores the distinction where it matters:
//   1. substantive rows get the injection slots first;
//   2. metadata rows fill leftover slots only, and are LABELLED as pointers so the reasoner treats
//      them as leads ("this source exists and is relevant") rather than as evidence to quote.
//
// Adaptive retrieval experiments are allowed to reduce the selection cap only inside an explicit
// request-local shadow context. Ordinary Production traffic keeps the caller's existing limit.

import { fullTextCharacters } from '@/lib/cos-core/layers/learning/cycle'
import { captureSelectedLearnedRows } from '@/lib/ai/cos/evidenceSourceUseTurnContext'
import { effectiveLearnedCorpusInjectionLimit } from '@/lib/ai/cos/adaptiveRetrievalContext'

export type LearnedEvidenceClass = 'full' | 'metadata'

export type ClassifiableLearnedRow = {
  summary?: unknown
  facts?: unknown
  confidence?: unknown
}

/**
 * Same rule cos-core applies at admission: a document shorter than 40% of the full-text threshold
 * is discovery metadata whatever its label claims. Kept in lockstep deliberately — if these two
 * definitions drift, rows change class between being written and being read.
 */
export function classifyLearnedEvidence(row: ClassifiableLearnedRow): LearnedEvidenceClass {
  const summary = String(row?.summary ?? '').replace(/\s+/g, ' ').trim()
  return summary.length < fullTextCharacters() * 0.4 ? 'metadata' : 'full'
}

/**
 * Choose which retrieved rows get the limited injection slots.
 *
 * Substantive rows first (preserving the caller's relevance order), then metadata rows to fill any
 * remaining slots. A metadata row is never dropped merely for being metadata — when nothing
 * substantive is relevant, a pointer to a real source still beats an empty context window — but it
 * can no longer crowd out content that could actually be cited.
 *
 * The exact selected rows are also captured request-locally before prompt rendering so later [CL#]
 * citations can be attributed to structured source_kind and similarity metadata without reparsing
 * prompt strings. A shadow validation policy may reduce the cap; it can never increase it.
 */
export function selectLearnedCorpusRows<T extends ClassifiableLearnedRow>(rows: T[], limit: number): T[] {
  const requestedCap = Math.max(0, Math.floor(limit))
  const cap = effectiveLearnedCorpusInjectionLimit(requestedCap)
  if (cap === 0) {
    captureSelectedLearnedRows([])
    return []
  }
  const full: T[] = []
  const metadata: T[] = []
  for (const row of rows) {
    if (classifyLearnedEvidence(row) === 'full') full.push(row)
    else metadata.push(row)
  }
  const selected = [...full, ...metadata].slice(0, cap)
  captureSelectedLearnedRows(selected)
  return selected
}

/**
 * How a row is announced to the reasoner. A metadata row is explicitly marked as a pointer so the
 * model knows its body was never retrieved — that is what stops it either ignoring the row silently
 * or, worse, inventing content to cite from a title.
 */
export function learnedEvidenceLabel(evidenceClass: LearnedEvidenceClass): string {
  return evidenceClass === 'metadata'
    ? 'reference pointer — source exists and is relevant; full text NOT retrieved, do not quote it as content'
    : 'retrieved content'
}
