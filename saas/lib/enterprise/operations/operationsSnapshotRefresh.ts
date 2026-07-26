// saas/lib/enterprise/operations/operationsSnapshotRefresh.ts
import type { OperationsIntelligenceSnapshot } from './operationsIntelligence'
import type { OperationsSnapshotProducer } from './operationsSnapshotProducer'

export type OperationsRefreshOrganization = Readonly<{
  organizationId: string
  enabled: boolean
  lastRefreshedAt?: string | null
}>

export type OperationsRefreshRegistry = Readonly<{
  listOrganizations(): Promise<readonly OperationsRefreshOrganization[]>
}>

export type OperationsRefreshResult = Readonly<{
  intervalStartedAt: string
  processed: number
  skipped: number
  failed: number
  snapshots: readonly OperationsIntelligenceSnapshot[]
  failures: readonly Readonly<{ organizationId: string; error: string }>[]
}>

function parseTimestamp(value: string, label: string): number {
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed)) throw new Error(`Invalid ${label} timestamp: ${value}`)
  return parsed
}

export class OperationsSnapshotRefresh {
  private readonly registry: OperationsRefreshRegistry
  private readonly producer: Pick<OperationsSnapshotProducer, 'produce'>
  constructor(
    registry: OperationsRefreshRegistry,
    producer: Pick<OperationsSnapshotProducer, 'produce'>,
  ) { this.registry = registry; this.producer = producer;}

  async run(input: Readonly<{ intervalStartedAt: string }>): Promise<OperationsRefreshResult> {
    const intervalStartedAtMs = parseTimestamp(input.intervalStartedAt, 'operations refresh intervalStartedAt')
    const intervalStartedAt = new Date(intervalStartedAtMs).toISOString()
    const organizations = await this.registry.listOrganizations()
    const seen = new Set<string>()
    const snapshots: OperationsIntelligenceSnapshot[] = []
    const failures: Array<{ organizationId: string; error: string }> = []
    let skipped = 0

    for (const organization of organizations) {
      const organizationId = organization.organizationId.trim()
      if (!organization.enabled || !organizationId || seen.has(organizationId)) {
        skipped += 1
        continue
      }
      seen.add(organizationId)

      if (organization.lastRefreshedAt) {
        try {
          if (parseTimestamp(organization.lastRefreshedAt, 'operations refresh lastRefreshedAt') >= intervalStartedAtMs) {
            skipped += 1
            continue
          }
        } catch (error) {
          failures.push({ organizationId, error: error instanceof Error ? error.message : 'Invalid refresh state.' })
          continue
        }
      }

      try {
        snapshots.push(await this.producer.produce({ organizationId, generatedAt: intervalStartedAt }))
      } catch (error) {
        failures.push({ organizationId, error: error instanceof Error ? error.message : 'Operations snapshot refresh failed.' })
      }
    }

    return Object.freeze({
      intervalStartedAt,
      processed: snapshots.length,
      skipped,
      failed: failures.length,
      snapshots: Object.freeze(snapshots),
      failures: Object.freeze(failures),
    })
  }
}
