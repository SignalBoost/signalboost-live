export type EnterpriseRiskLevel = 'low' | 'medium' | 'high' | 'critical'

export interface DependencyNode {
  serviceId: string
  environment: string
  isDatabase: boolean
  criticality: 'standard' | 'important' | 'critical'
  downstreamDependencies: string[]
}

export interface BlastRadiusPolicy {
  mediumAtAffectedCount: number
  highAtAffectedCount: number
  criticalAtAffectedCount: number
  productionRiskFloor: EnterpriseRiskLevel
  databaseRiskFloor: EnterpriseRiskLevel
  criticalServiceRiskFloor: EnterpriseRiskLevel
}

const rank: Record<EnterpriseRiskLevel, number> = { low: 0, medium: 1, high: 2, critical: 3 }
function maxRisk(a: EnterpriseRiskLevel, b: EnterpriseRiskLevel): EnterpriseRiskLevel { return rank[a] >= rank[b] ? a : b }

export class DependencyKnowledgeGraph {
  private readonly nodes = new Map<string, DependencyNode>()

  register(node: DependencyNode): void {
    if (!node.serviceId.trim()) throw new Error('Dependency node serviceId is required')
    this.nodes.set(node.serviceId, { ...node, downstreamDependencies: [...new Set(node.downstreamDependencies)].sort() })
  }

  analyze(serviceId: string, policy: BlastRadiusPolicy): { affectedServices: string[]; riskLevel: EnterpriseRiskLevel; databaseInvolved: boolean; criticalServiceInvolved: boolean } {
    const affected = new Set<string>()
    this.traverse(serviceId, affected)
    const nodes = [...affected].map(id => this.nodes.get(id)).filter((item): item is DependencyNode => Boolean(item))
    const count = affected.size
    let risk: EnterpriseRiskLevel = 'low'
    if (count >= policy.criticalAtAffectedCount) risk = 'critical'
    else if (count >= policy.highAtAffectedCount) risk = 'high'
    else if (count >= policy.mediumAtAffectedCount) risk = 'medium'

    const production = nodes.some(node => node.environment === 'production')
    const databaseInvolved = nodes.some(node => node.isDatabase)
    const criticalServiceInvolved = nodes.some(node => node.criticality === 'critical')
    if (production) risk = maxRisk(risk, policy.productionRiskFloor)
    if (databaseInvolved) risk = maxRisk(risk, policy.databaseRiskFloor)
    if (criticalServiceInvolved) risk = maxRisk(risk, policy.criticalServiceRiskFloor)

    return { affectedServices: [...affected].sort(), riskLevel: risk, databaseInvolved, criticalServiceInvolved }
  }

  private traverse(serviceId: string, visited: Set<string>): void {
    if (visited.has(serviceId)) return
    visited.add(serviceId)
    const node = this.nodes.get(serviceId)
    if (!node) return
    for (const downstream of node.downstreamDependencies) this.traverse(downstream, visited)
  }
}
