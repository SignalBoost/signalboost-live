// saas/app/api/portable-products/live/route.ts
import { NextResponse } from 'next/server'
import { listPublicPortableProducts } from '@/lib/portable-products'
import { loadAllPortableActivity, type PortableLiveActivity } from '@/lib/portable-products/live-activity'
import { createSupabasePortableActivityStore } from '@/lib/portable-products/live-activity-supabase'

export const dynamic = 'force-dynamic'
export const revalidate = 0

async function loadAgentOperationsActivity(store: NonNullable<ReturnType<typeof createSupabasePortableActivityStore>>): Promise<PortableLiveActivity> {
  try {
    const result = await store.readTableActivity('agent_operation_activity', 'created_at')
    const count = result.rowCount
    const status = count === null ? 'unreachable' : count > 0 ? 'active' : 'idle'
    return {
      productId: 'agent-operations-platform',
      status,
      tables: [{ table: 'agent_operation_activity', meaning: 'agent workflows completed', rowCount: count, lastActivityAt: result.lastActivityAt, status }],
      lastActivityAt: result.lastActivityAt,
      totalRows: count ?? 0,
      summary: count && count > 0 ? `Agent Operations has ${count} durable workflow outcome records.` : status === 'idle' ? 'Agent Operations is connected to its durable ledger but no workflow has run yet.' : 'Agent Operations ledger could not be read.',
    }
  } catch (error) {
    return {
      productId: 'agent-operations-platform',
      status: 'unreachable',
      tables: [{ table: 'agent_operation_activity', meaning: 'agent workflows completed', rowCount: null, lastActivityAt: null, status: 'unreachable', error: error instanceof Error ? error.message : 'read failed' }],
      lastActivityAt: null,
      totalRows: 0,
      summary: 'Agent Operations ledger could not be read.',
    }
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
  const agentOperations = await loadAgentOperationsActivity(store)
  const activity = baseActivity.map((item) => item.productId === 'agent-operations-platform' ? agentOperations : item)
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
