// saas/lib/cos/overview.ts
// Assembles the admin dashboard payload from a MiningStore. Kept in the portable module
// (not in the route handler) so the same intelligence view ships to any host.

import { MiningStore, MiningRunRow, SegmentCount } from './mining/storage'
import { AssociationRule } from './mining/types'

export interface MiningOverview {
  latestRun: MiningRunRow | null
  recentRuns: MiningRunRow[]
  segmentDistribution: SegmentCount[]
  topRules: AssociationRule[]
  totals: {
    usersSegmented: number
    rules: number
  }
}

export async function buildOverview(
  store: MiningStore,
  opts: { runs?: number; rules?: number } = {},
): Promise<MiningOverview> {
  const [recentRuns, segmentDistribution, topRules] = await Promise.all([
    store.getRecentRuns(opts.runs ?? 10),
    store.getSegmentDistribution(),
    store.getTopRules(opts.rules ?? 10),
  ])

  const usersSegmented = segmentDistribution.reduce((a, b) => a + b.count, 0)

  return {
    latestRun: recentRuns[0] ?? null,
    recentRuns,
    segmentDistribution,
    topRules,
    totals: { usersSegmented, rules: topRules.length },
  }
}
