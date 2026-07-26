// saas/lib/enterprise/operations/operationsSnapshotProducer.ts
import type { ClosedLoopVerificationResult } from '../memory/closedLoopVerification.ts'
import type { OrganizationalRepairLearning } from '../memory/organizationalLearning.ts'
import type { EnterprisePlaybookRegistry } from '../memory/playbookIntelligence.ts'
import {
  buildOperationsIntelligenceSnapshot,
  type OperationsIncident,
  type OperationsIntelligenceSnapshot,
} from './operationsIntelligence.ts'

export type OperationsSnapshotSource = Readonly<{
  loadIncidents(organizationId: string): Promise<readonly OperationsIncident[]>
  loadVerifications(organizationId: string): Promise<readonly ClosedLoopVerificationResult[]>
  loadLearning(organizationId: string): Promise<OrganizationalRepairLearning>
  loadPlaybooks(organizationId: string): Promise<EnterprisePlaybookRegistry>
}>

export type OperationsSnapshotWriter = Readonly<{
  save(snapshot: OperationsIntelligenceSnapshot): Promise<OperationsIntelligenceSnapshot>
}>

export type ProduceOperationsSnapshotInput = Readonly<{
  organizationId: string
  generatedAt?: string
}>

export class OperationsSnapshotProducer {
  private readonly source: OperationsSnapshotSource
  private readonly writer: OperationsSnapshotWriter
  constructor(
    source: OperationsSnapshotSource,
    writer: OperationsSnapshotWriter,
  ) {
    this.source = source
    this.writer = writer
  }

  async produce(input: ProduceOperationsSnapshotInput): Promise<OperationsIntelligenceSnapshot> {
    const organizationId = input.organizationId.trim()
    if (!organizationId) throw new Error('Operations snapshot production requires organizationId.')

    const [incidents, verifications, learning, playbooks] = await Promise.all([
      this.source.loadIncidents(organizationId),
      this.source.loadVerifications(organizationId),
      this.source.loadLearning(organizationId),
      this.source.loadPlaybooks(organizationId),
    ])

    const snapshot = buildOperationsIntelligenceSnapshot({
      organizationId,
      incidents,
      verifications,
      learning,
      playbooks,
      generatedAt: input.generatedAt,
    })

    const saved = await this.writer.save(snapshot)
    if (saved.organizationId !== snapshot.organizationId || saved.generatedAt !== snapshot.generatedAt) {
      throw new Error('Operations snapshot writer returned a mismatched snapshot identity.')
    }

    return saved
  }
}
