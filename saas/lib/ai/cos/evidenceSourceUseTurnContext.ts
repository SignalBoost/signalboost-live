// saas/lib/ai/cos/evidenceSourceUseTurnContext.ts
//
// Request-local correlation envelope for learned-corpus source attribution and the reasoner turn id.

import { AsyncLocalStorage } from 'node:async_hooks'
import { currentAdaptiveRetrievalShadowPolicy, type AdaptiveRetrievalShadowPolicy } from './adaptiveRetrievalContext.ts'

export type CapturedLearnedRetrievalItem = {
  sourceKind: string
  similarity: number | null
  contentHash: string | null
  summaryChars: number
}

/** Stable legacy snapshot used by existing outcome-correlation callers/tests. */
export type CapturedEvidenceSourceUseTurn = {
  turnId: string
  sourceKinds: string[]
  citedIndices: number[]
}

/** Extended snapshot consumed only by the evidence-use persistence layer. */
export type DetailedCapturedEvidenceSourceUseTurn = CapturedEvidenceSourceUseTurn & {
  items: CapturedLearnedRetrievalItem[]
  retrievalPolicy: AdaptiveRetrievalShadowPolicy | null
}

type EvidenceSourceUseTurnState = {
  turnId: string | null
  selectedSourceKinds: string[]
  selectedItems: CapturedLearnedRetrievalItem[]
  retrievalPolicy: AdaptiveRetrievalShadowPolicy | null
  citedIndices: number[]
  answerAssessed: boolean
}

const storage = new AsyncLocalStorage<EvidenceSourceUseTurnState>()

function freshState(): EvidenceSourceUseTurnState {
  return { turnId:null, selectedSourceKinds:[], selectedItems:[], retrievalPolicy:null, citedIndices:[], answerAssessed:false }
}

function state(): EvidenceSourceUseTurnState {
  const existing = storage.getStore()
  if (existing) return existing
  const created = freshState()
  storage.enterWith(created)
  return created
}

export function beginEvidenceSourceUseTurn(): void {
  const current = state()
  current.turnId = null
  current.selectedSourceKinds = []
  current.selectedItems = []
  current.retrievalPolicy = null
  current.citedIndices = []
  current.answerAssessed = false
}

function selectedValue(row: unknown): Record<string, unknown> {
  const value = row && typeof row === 'object' ? row as Record<string, unknown> : {}
  const item = value.item && typeof value.item === 'object' ? value.item as Record<string, unknown> : {}
  return { ...item, ...value }
}

function sourceKindFromSelectedRow(row: unknown): string {
  const kind = String(selectedValue(row).source_kind ?? 'unknown').trim().toLowerCase()
  return /^[a-z0-9_-]+$/.test(kind) ? kind : 'unknown'
}

function itemFromSelectedRow(row: unknown): CapturedLearnedRetrievalItem {
  const value = selectedValue(row)
  const similarityRaw = value.similarity
  const similarityNumber = similarityRaw == null ? null : Number(similarityRaw)
  const summary = String(value.summary ?? '')
  const hash = String(value.content_hash ?? '').trim()
  return {
    sourceKind: sourceKindFromSelectedRow(row),
    similarity: similarityNumber != null && Number.isFinite(similarityNumber) ? Math.max(0, Math.min(1, similarityNumber)) : null,
    contentHash: hash || null,
    summaryChars: Math.max(0, summary.length),
  }
}

export function captureSelectedLearnedRows(rows: readonly unknown[]): void {
  const current = state()
  current.turnId = null
  current.citedIndices = []
  current.answerAssessed = false
  current.selectedItems = Array.isArray(rows) ? rows.map(itemFromSelectedRow) : []
  current.selectedSourceKinds = current.selectedItems.map(item => item.sourceKind)
  current.retrievalPolicy = currentAdaptiveRetrievalShadowPolicy()
}

export function captureSelectedLearnedSourceKinds(rows: readonly unknown[]): void {
  captureSelectedLearnedRows(rows)
}

export function captureEvidenceSourceUseTurnId(turnId: string): void {
  const value = String(turnId ?? '').trim()
  if (value) state().turnId = value
}

export function peekEvidenceSourceUseTurnId(): string | null {
  return storage.getStore()?.turnId ?? null
}

export function captureLearnedCitationIndices(indices: readonly number[]): void {
  const current = state()
  current.citedIndices = [...new Set((Array.isArray(indices) ? indices : [])
    .map(value => Math.floor(Number(value)))
    .filter(value => Number.isFinite(value) && value > 0))]
  current.answerAssessed = true
}

function detailedSnapshot(): DetailedCapturedEvidenceSourceUseTurn | null {
  const current = storage.getStore()
  if (!current || !current.turnId || !current.answerAssessed || current.selectedSourceKinds.length === 0) return null
  return {
    turnId: current.turnId,
    sourceKinds: [...current.selectedSourceKinds],
    citedIndices: [...current.citedIndices],
    items: current.selectedItems.map(item => ({ ...item })),
    retrievalPolicy: current.retrievalPolicy ? { ...current.retrievalPolicy } : null,
  }
}

function clearCurrent(): void {
  const current = storage.getStore()
  if (!current) return
  current.turnId = null
  current.selectedSourceKinds = []
  current.selectedItems = []
  current.retrievalPolicy = null
  current.citedIndices = []
  current.answerAssessed = false
}

/** Existing public contract: consume once and return only the historical three fields. */
export function consumeEvidenceSourceUseTurn(): CapturedEvidenceSourceUseTurn | null {
  const detailed = detailedSnapshot()
  const snapshot = detailed ? {
    turnId: detailed.turnId,
    sourceKinds: detailed.sourceKinds,
    citedIndices: detailed.citedIndices,
  } : null
  clearCurrent()
  return snapshot
}

/** Adaptive telemetry consumer: same one-shot semantics, with prompt-free item/policy metadata. */
export function consumeDetailedEvidenceSourceUseTurn(): DetailedCapturedEvidenceSourceUseTurn | null {
  const snapshot = detailedSnapshot()
  clearCurrent()
  return snapshot
}
