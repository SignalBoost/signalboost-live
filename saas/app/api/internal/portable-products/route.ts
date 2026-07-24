import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/outreach/security'
import { parsePortableProductCatalogFilters, serializePortableProductCatalog } from '@/lib/portable-products/catalog-serialization'

/** Internal, read-only portable-product inspection endpoint. */
export async function GET(request: NextRequest) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth
  try {
    const filters = parsePortableProductCatalogFilters(new URL(request.url).searchParams)
    return NextResponse.json(serializePortableProductCatalog(new Date().toISOString(), filters))
  } catch {
    return NextResponse.json({ error: 'Invalid portable product catalog filter' }, { status: 400 })
  }
}
