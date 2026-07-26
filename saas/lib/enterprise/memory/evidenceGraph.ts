// saas/lib/enterprise/memory/evidenceGraph.ts
// Pure, deterministic evidence graph for explainable Enterprise Memory decisions.
// This layer does not execute actions or bypass approval; it only connects sanitized evidence.

import type { EnterpriseMemoryCandidate, EnterpriseMemoryKind } from './retrievalRanking.ts'

export type EvidenceNodeKind = EnterpriseMemoryKind

export type EvidenceRelation =
  | 'BELONGS_TO'
  | 'DESCRIBES'
  | 'INFORMS'
  | 'APPROVES'
  | 'CALIBRATES'
  | 'MEASURES'

export type EvidenceNode = {
  id: string
  kind: EvidenceNodeKind
  workspace: string | null
  occurredAt: string | null
  confidence: number
  payload: Readonly<Record<string, unknown>>
}

export type EvidenceEdge = {
  id: string
  from: string
  to: string
  relation: EvidenceRelation
}

export type EnterpriseEvidenceGraph = {
  organizationId: string
  nodes: readonly EvidenceNode[]
  edges: readonly EvidenceEdge[]
}

export type EvidenceTraversal = {
  nodes: readonly EvidenceNode[]
  edges: readonly EvidenceEdge[]
}

function clean(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function clamp01(value: unknown): number {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return 0
  return Math.min(1, Math.max(0, numeric))
}

function nodeKey(kind: EvidenceNodeKind, id: string): string {
  return `${kind}:${id}`
}

function edge(from: string, to: string, relation: EvidenceRelation): EvidenceEdge {
  return Object.freeze({ id: `${from}|${relation}|${to}`, from, to, relation })
}

export function buildEnterpriseEvidenceGraph(args: {
  organizationId: string
  candidates: readonly EnterpriseMemoryCandidate[]
}): EnterpriseEvidenceGraph {
  const organizationId = clean(args.organizationId)
  if (!organizationId) throw new Error('Evidence graph organizationId is required.')

  const nodesById = new Map<string, EvidenceNode>()
  for (const candidate of args.candidates) {
    const id = clean(candidate.id)
    if (!id) continue
    const key = nodeKey(candidate.kind, id)
    if (nodesById.has(key)) continue
    nodesById.set(key, Object.freeze({
      id: key,
      kind: candidate.kind,
      workspace: clean(candidate.workspace) || null,
      occurredAt: clean(candidate.occurredAt) || null,
      confidence: clamp01(candidate.confidence),
      payload: Object.freeze({ ...candidate.payload }),
    }))
  }

  const organizationNode = [...nodesById.values()].find(node => node.kind === 'organization' && clean(node.payload.name))
    || [...nodesById.values()].find(node => node.kind === 'organization')
  const edgesById = new Map<string, EvidenceEdge>()

  if (organizationNode) {
    for (const node of nodesById.values()) {
      if (node.id === organizationNode.id) continue
      const relation: EvidenceRelation = node.kind === 'repository' ? 'BELONGS_TO' : 'INFORMS'
      const item = edge(node.id, organizationNode.id, relation)
      edgesById.set(item.id, item)
    }
  }

  const campaignNodes = [...nodesById.values()].filter(node => node.kind === 'campaign')
  const campaignByRawId = new Map(campaignNodes.map(node => [clean(node.payload.campaignId) || node.id.slice('campaign:'.length), node]))

  for (const node of nodesById.values()) {
    const campaignId = clean(node.payload.campaignId)
    const campaign = campaignId ? campaignByRawId.get(campaignId) : undefined
    if (campaign && node.id !== campaign.id) {
      const relation: EvidenceRelation = node.kind === 'approval'
        ? 'APPROVES'
        : node.kind === 'confidence'
          ? 'CALIBRATES'
          : 'INFORMS'
      const item = edge(node.id, campaign.id, relation)
      edgesById.set(item.id, item)
    }

    if (node.kind === 'campaign') {
      const performance = node.payload.performanceData
      if (performance && typeof performance === 'object') {
        const item = edge(node.id, node.id, 'MEASURES')
        edgesById.set(item.id, item)
      }
    }
  }

  return Object.freeze({
    organizationId,
    nodes: Object.freeze([...nodesById.values()].sort((a, b) => a.id.localeCompare(b.id))),
    edges: Object.freeze([...edgesById.values()].sort((a, b) => a.id.localeCompare(b.id))),
  })
}

export function traverseEvidenceGraph(
  graph: EnterpriseEvidenceGraph,
  startNodeId: string,
  options: { maxDepth?: number; maxNodes?: number; relations?: readonly EvidenceRelation[] } = {},
): EvidenceTraversal {
  const maxDepth = options.maxDepth ?? 3
  const maxNodes = options.maxNodes ?? 50
  if (!Number.isSafeInteger(maxDepth) || maxDepth < 0 || maxDepth > 8) {
    throw new Error('Evidence traversal maxDepth must be an integer from 0 to 8.')
  }
  if (!Number.isSafeInteger(maxNodes) || maxNodes < 1 || maxNodes > 200) {
    throw new Error('Evidence traversal maxNodes must be an integer from 1 to 200.')
  }

  const allowed = options.relations ? new Set(options.relations) : null
  const nodeMap = new Map(graph.nodes.map(node => [node.id, node]))
  if (!nodeMap.has(startNodeId)) return { nodes: Object.freeze([]), edges: Object.freeze([]) }

  const adjacency = new Map<string, EvidenceEdge[]>()
  for (const item of graph.edges) {
    if (allowed && !allowed.has(item.relation)) continue
    const outgoing = adjacency.get(item.from) || []
    outgoing.push(item)
    adjacency.set(item.from, outgoing)
    if (item.to !== item.from) {
      const incoming = adjacency.get(item.to) || []
      incoming.push(item)
      adjacency.set(item.to, incoming)
    }
  }

  const visited = new Set<string>([startNodeId])
  const selectedEdges = new Map<string, EvidenceEdge>()
  const queue: Array<{ id: string; depth: number }> = [{ id: startNodeId, depth: 0 }]

  while (queue.length && visited.size < maxNodes) {
    const current = queue.shift()!
    if (current.depth >= maxDepth) continue
    const connected = [...(adjacency.get(current.id) || [])].sort((a, b) => a.id.localeCompare(b.id))
    for (const item of connected) {
      selectedEdges.set(item.id, item)
      const nextId = item.from === current.id ? item.to : item.from
      if (!visited.has(nextId) && nodeMap.has(nextId) && visited.size < maxNodes) {
        visited.add(nextId)
        queue.push({ id: nextId, depth: current.depth + 1 })
      }
    }
  }

  return Object.freeze({
    nodes: Object.freeze([...visited].map(id => nodeMap.get(id)!).sort((a, b) => a.id.localeCompare(b.id))),
    edges: Object.freeze([...selectedEdges.values()].sort((a, b) => a.id.localeCompare(b.id))),
  })
}
