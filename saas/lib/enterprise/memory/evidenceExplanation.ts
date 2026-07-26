// saas/lib/enterprise/memory/evidenceExplanation.ts
// Deterministic, bounded explanations derived only from supplied Enterprise Memory evidence.

import type { RankedEnterpriseMemory } from './retrievalRanking.ts'
import type { EnterpriseEvidenceGraph, EvidenceNode } from './evidenceGraph.ts'

export type EvidenceExplanationItem = {
  nodeId: string
  kind: EvidenceNode['kind']
  reason: string
  confidence: number
  occurredAt: string | null
}

export type EvidenceBasedExplanation = {
  recommendation: string
  confidence: number
  summary: string
  evidence: readonly EvidenceExplanationItem[]
}

function clean(value: unknown, max = 1000): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function clamp01(value: unknown): number {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return 0
  return Math.min(1, Math.max(0, numeric))
}

function reasonFor(node: EvidenceNode): string {
  const payload = node.payload
  if (node.kind === 'approval') return clean(payload.decision) === 'approved' ? 'Human approved' : 'Human review evidence'
  if (node.kind === 'campaign') {
    const status = clean(payload.executionStatus)
    const cta = clean(payload.cta, 160)
    if (cta) return `Campaign used CTA: ${cta}`
    if (status) return `Campaign status: ${status}`
    return 'Historical campaign evidence'
  }
  if (node.kind === 'confidence') return 'Confidence calibration history'
  if (node.kind === 'repository') return 'Repository intelligence evidence'
  if (node.kind === 'intelligence') return 'Organization intelligence evidence'
  if (node.kind === 'organization') return 'Organization profile evidence'
  if (node.kind === 'audience') return 'Audience evidence'
  if (node.kind === 'product') return 'Product evidence'
  return 'Enterprise Memory evidence'
}

export function buildEvidenceBasedExplanation(args: {
  recommendation: string
  rankedMemory: readonly RankedEnterpriseMemory[]
  graph: EnterpriseEvidenceGraph
  maxEvidence?: number
}): EvidenceBasedExplanation {
  const recommendation = clean(args.recommendation, 2000)
  if (!recommendation) throw new Error('Evidence explanation recommendation is required.')
  const maxEvidence = args.maxEvidence ?? 5
  if (!Number.isSafeInteger(maxEvidence) || maxEvidence < 1 || maxEvidence > 12) {
    throw new Error('Evidence explanation maxEvidence must be an integer from 1 to 12.')
  }

  const nodes = new Map(args.graph.nodes.map(node => [node.id, node]))
  const seen = new Set<string>()
  const evidence: EvidenceExplanationItem[] = []

  for (const memory of args.rankedMemory) {
    const nodeId = `${memory.kind}:${clean(memory.id)}`
    const node = nodes.get(nodeId)
    if (!node || seen.has(nodeId)) continue
    seen.add(nodeId)
    evidence.push(Object.freeze({
      nodeId,
      kind: node.kind,
      reason: reasonFor(node),
      confidence: clamp01(memory.confidence ?? node.confidence),
      occurredAt: node.occurredAt,
    }))
    if (evidence.length >= maxEvidence) break
  }

  const confidence = evidence.length
    ? Math.round((evidence.reduce((sum, item) => sum + item.confidence, 0) / evidence.length) * 1000) / 1000
    : 0
  const summary = evidence.length
    ? `Supported by ${evidence.length} traceable Enterprise Memory item${evidence.length === 1 ? '' : 's'}.`
    : 'No traceable Enterprise Memory evidence was available.'

  return Object.freeze({
    recommendation,
    confidence,
    summary,
    evidence: Object.freeze(evidence),
  })
}
