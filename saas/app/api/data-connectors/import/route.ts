import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/utils/supabase/server'
import { importApiItems, importCsvItems, importScraperItems } from '@/lib/data-connectors'

export async function POST(req: NextRequest) {
  // Auth: paid-API route — signed-in users only.
  const authedUser = await getCurrentUser()
  if (!authedUser) {
    return NextResponse.json({ error: 'Please sign in.' }, { status: 401 })
  }


  try {
    const body = await req.json()
    const mode = body.mode as 'csv' | 'api' | 'scraper'

    if (mode === 'csv') {
      const result = await importCsvItems(body.csvText, { fileName: body.fileName ?? null })
      return NextResponse.json(result)
    }

    if (mode === 'api') {
      const result = await importApiItems(body.endpoint, body.mapping ?? {}, body.config ?? {})
      return NextResponse.json(result)
    }

    if (mode === 'scraper') {
      const result = await importScraperItems({ json: body.json, csv: body.csvText, mapping: body.mapping, config: body.config })
      return NextResponse.json(result)
    }

    return NextResponse.json({ error: 'Invalid mode' }, { status: 400 })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Import failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
