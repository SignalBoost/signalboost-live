import { NextResponse } from 'next/server'
import { generateWebsiteRebuild } from '@/lib/websites/rebuild'
import { persistWebsiteRebuild } from '@/lib/websites/storage'

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))
    const source_url = typeof body.source_url === 'string' ? body.source_url : typeof body.url === 'string' ? body.url : ''
    if (!source_url.trim()) return NextResponse.json({ error: 'source_url is required' }, { status: 400 })
    const rebuild = await generateWebsiteRebuild({ source_url, business_type: typeof body.business_type === 'string' ? body.business_type : undefined, language: typeof body.language === 'string' ? body.language : 'en' })
    const stored = await persistWebsiteRebuild(typeof body.account_id === 'string' ? body.account_id : null, source_url, rebuild)
    return NextResponse.json({ ...rebuild, rebuild_id: stored.rebuildId, stored: stored.stored })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to generate website rebuild.' }, { status: 400 })
  }
}
