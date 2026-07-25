// saas/app/api/portable-products/live/route.ts
import { NextResponse } from 'next/server'
import { listPublicPortableProducts } from '@/lib/portable-products'
import { loadAllPortableActivity, type PortableLiveActivity } from '@/lib/portable-products/live-activity'
import { createSupabasePortableActivityStore } from '@/lib/portable-products/live-activity-supabase'

export const dynamic = 'force-dynamic'
export const revalidate = 0

type Store = NonNullable<ReturnType<typeof createSupabasePortableActivityStore>>
type Source = { table: string; timestampColumn: string; meaning: string }

const LIVE_SOURCE_OVERRIDES: Readonly<Record<string, readonly Source[]>> = Object.freeze({
  'video-maker': Object.freeze([
    { table: 'video_jobs', timestampColumn: 'created_at', meaning: 'video render and export jobs' },
    { table: 'video_storage', timestampColumn: 'created_at', meaning: 'video artifacts stored' },
  ]),
  'marketing-sales': Object.freeze([
    { table: 'ms_campaigns', timestampColumn: 'created_at', meaning: 'marketing and sales campaigns created' },
    { table: 'ms_drafts', timestampColumn: 'created_at', meaning: 'campaign drafts created' },
    { table: 'ms_publish_results', timestampColumn: 'at', meaning: 'publishing outcomes recorded' },
    { table: 'ms_metrics', timestampColumn: 'captured_at', meaning: 'campaign metrics captured' },
    { table: 'ms_audit', timestampColumn: 'at', meaning: 'department actions audited' },
  ]),
  'browser-agent-ecosystem': Object.freeze([
    { table: 'portable_browser_activity', timestampColumn: 'created_at', meaning: 'browser runtime lifecycle events recorded' },
  ]),
  'agent-operations-platform': Object.freeze([
    { table: 'agent_operation_activity', timestampColumn: 'created_at', meaning: 'agent workflows completed' },
  ]),
})

async function loadOverrideActivity(productId: string, store: Store): Promise<PortableLiveActivity> {
  const sources = LIVE_SOURCE_OVERRIDES[productId] ?? []
  const tables: PortableLiveActivity['tables'][number][] = []

  for (const source of sources) {
    try {
      const result = await store.readTableActivity(source.table, source.timestampColumn)
      const status = result.rowCount === null ? 'unreachable' : result.rowCount > 0 ? 'active' : 'idle'
      tables.push({ table: source.table, meaning: source.meaning, rowCount: result.rowCount, lastActivityAt: result.lastActivityAt, status })
    } catch (error) {
      tables.push({ table: source.table, meaning: source.meaning, rowCount: null, lastActivityAt: null, status: 'unreachable', error: error instanceof Error ? error.message : 'read failed' })
    }
  }

  const anyUnreachable = tables.some((table) => table.status === 'unreachable')
  const anyActive = tables.some((table) => table.status === 'active')
  const status = anyUnreachable ? 'unreachable' : anyActive ? 'active' : 'idle'
  const totalRows = tables.reduce((sum, table) => sum + (table.rowCount ?? 0), 0)
  const timestamps = tables.map((table) => table.lastActivityAt).filter((value): value is string => Boolean(value)).sort()
  const lastActivityAt = timestamps.at(-1) ?? null

  return {
    productId,
    status,
    tables,
    lastActivityAt,
    totalRows,
    summary: status === 'active'
      ? `${productId} has ${totalRows} durable operational records.`
      : status === 'idle'
        ? `${productId} is connected to durable operational sources but has no records yet.`
        : `${productId} has at least one operational source that could not be read.`,
  }
}

export async function GET() {
  const products = listPublicPortableProducts()
  const productIds = products.map((product) => product.manifest.productId)
  const store = createSupabasePortableActivityStore()

  if (!store) {
    return NextResponse.json(
      {
        generatedAt: new Date().toISOString(),
        status: 'unreachable',
        totalRows: 0,
        activePortables: 0,
        portables: productIds.map((productId) => ({ productId, status: 'unreachable', totalRows: 0, lastActivityAt: null })),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  }

  const baseActivity = await loadAllPortableActivity(productIds, store)
  const overrides = new Map<string, PortableLiveActivity>()
  for (const productId of Object.keys(LIVE_SOURCE_OVERRIDES)) overrides.set(productId, await loadOverrideActivity(productId, store))
  const activity = baseActivity.map((item) => overrides.get(item.productId) ?? item)
  const totalRows = activity.reduce((sum, item) => sum + item.totalRows, 0)
  const activePortables = activity.filter((item) => item.status === 'active').length
  const status = activity.some((item) => item.status === 'unreachable') ? 'degraded' : activePortables > 0 ? 'active' : 'idle'

  return NextResponse.json(
    {
      generatedAt: new Date().toISOString(),
      status,
      totalRows,
      activePortables,
      portables: activity.map((item) => ({ productId: item.productId, status: item.status, totalRows: item.totalRows, lastActivityAt: item.lastActivityAt })),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
