// saas/app/api/portable-products/live/route.ts
import { NextResponse } from 'next/server'
import { listPublicPortableProducts } from '@/lib/portable-products'
import { loadAllPortableActivity } from '@/lib/portable-products/live-activity'
import { createSupabasePortableActivityStore } from '@/lib/portable-products/live-activity-supabase'

export const dynamic = 'force-dynamic'
export const revalidate = 0

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
        portables: productIds.map((productId) => ({
          productId,
          status: 'unreachable',
          totalRows: 0,
          lastActivityAt: null,
        })),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  }

  const activity = await loadAllPortableActivity(productIds, store)
  const totalRows = activity.reduce((sum, item) => sum + item.totalRows, 0)
  const activePortables = activity.filter((item) => item.status === 'active').length
  const status = activity.some((item) => item.status === 'unreachable')
    ? 'degraded'
    : activePortables > 0
      ? 'active'
      : 'idle'

  return NextResponse.json(
    {
      generatedAt: new Date().toISOString(),
      status,
      totalRows,
      activePortables,
      portables: activity.map((item) => ({
        productId: item.productId,
        status: item.status,
        totalRows: item.totalRows,
        lastActivityAt: item.lastActivityAt,
      })),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
