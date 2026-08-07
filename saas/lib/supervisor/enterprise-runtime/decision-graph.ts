import type { SerializableValue } from '../incident-schema.ts'

export type DecisionNodeKind = 'evidence' | 'hypothesis' | 'diagnosis' | 'capability' | 'policy' | 'quorum' | 'dry_run' | 'execution' | 'verification' | 'rollback'

export interface DecisionNode {
  nodeId: string
  kind: DecisionNodeKind
  label: string
  timestamp: string
  data: Record<string, SerializableValue>
}

export interface DecisionEdge {
  from: string
  to: string
  relation: 'supports' | 'rejects' | 'derived_from' | 'authorizes' | 'constrains' | 'verifies' | 'rolls_back'
}

export interface DecisionGraphSnapshot {
  incidentId: string
  nodes: DecisionNode[]
  edges: DecisionEdge[]
}

export class DecisionGraph {
  private readonly nodes = new Map<string, DecisionNode>()
  private readonly edges: DecisionEdge[] = []

  constructor(private readonly incidentId: string) {}

  addNode(node: DecisionNode): void {
    if (this.nodes.has(node.nodeId)) throw new Error(`Duplicate decision node ${node.nodeId}`)
    this.nodes.set(node.nodeId, structuredClone(node))
  }

  link(edge: DecisionEdge): void {
    if (!this.nodes.has(edge.from) || !this.nodes.has(edge.to)) throw new Error('Decision graph edge references an unknown node')
    this.edges.push({ ...edge })
  }

  snapshot(): DecisionGraphSnapshot {
    return {
      incidentId: this.incidentId,
      nodes: [...this.nodes.values()].sort((a, b) => a.timestamp.localeCompare(b.timestamp) || a.nodeId.localeCompare(b.nodeId)),
      edges: [...this.edges].sort((a, b) => `${a.from}:${a.to}:${a.relation}`.localeCompare(`${b.from}:${b.to}:${b.relation}`)),
    }
  }
}
