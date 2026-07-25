// saas/app/api/portable-products/live/route.ts
//
// The homepage's live signal. Deliberately thin: it reads, it does not decide.
//
// This route used to carry a LIVE_SOURCE_OVERRIDES map that added table sources for four
// portables the lib/portable-products/live-activity module had deliberately left out. That
// created two sources of truth, and the module's own doc comment ended up contradicting the
// route that used it. Worse, two of those overrides pointed at tables whose only writer was
// an adapter nothing called — so those portables rendered as "Connected · idle", which reads
// as wired-up-but-quiet, when the row count could never move off zero.
//
// The map now lives in one place, with a stated reason for every portable that has no
// signal. If a portable belongs on this page, it earns its entry there — not here.

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
        summary: item.summary,
      })),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
