import { NextResponse } from 'next/server'
import { printDeskPayloadMapper } from '@/lib/cos-marketing-sales'
import type { PrintAssetMetadata, PrintDeskContact, PrintDimensions } from '@/lib/cos-marketing-sales'

export const dynamic = 'force-dynamic'

type Body = {
  locale?: string
  campaignId?: string
  asset?: Partial<PrintAssetMetadata>
  publisher?: Partial<PrintDeskContact>
  dimensions?: Partial<PrintDimensions>
}

async function readBody(req: Request): Promise<Body> {
  try {
    const body = await req.json()
    return body && typeof body === 'object' ? body : {}
  } catch {
    return {}
  }
}

export async function POST(req: Request) {
  const body = await readBody(req)

  if (!body.asset?.assetId || !body.asset?.assetTitle || !body.asset?.fileName) {
    return NextResponse.json({ ok: false, error: 'Approved asset metadata is required.' }, { status: 400 })
  }

  if (!body.publisher?.publisherName || !body.publisher?.deskEmail) {
    return NextResponse.json({ ok: false, error: 'Publisher name and desk email are required.' }, { status: 400 })
  }

  const payload = printDeskPayloadMapper.compile({
    locale: body.locale,
    campaignId: body.campaignId,
    asset: {
      assetId: body.asset.assetId,
      assetTitle: body.asset.assetTitle,
      fileName: body.asset.fileName,
      fileUrl: body.asset.fileUrl,
      mimeType: body.asset.mimeType || 'application/pdf',
      checksum: body.asset.checksum,
      approvedBy: body.asset.approvedBy,
      approvedAt: body.asset.approvedAt,
    },
    publisher: {
      publisherName: body.publisher.publisherName,
      deskEmail: body.publisher.deskEmail,
      phone: body.publisher.phone,
      market: body.publisher.market,
      notes: body.publisher.notes,
    },
    dimensions: body.dimensions,
  })

  return NextResponse.json({
    ok: true,
    module: 'cos_marketing_sales',
    route: 'print-desk',
    mode: 'compiled_payload_only_owner_approval_required',
    payload,
  })
}
