import { NextResponse } from 'next/server'
import { optimizeWebsiteContent } from '@/lib/websites/optimizer'

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))
    const url = typeof body.url === 'string' ? body.url : ''
    const section = typeof body.section === 'string' ? body.section : 'hero'
    if (!url.trim()) return NextResponse.json({ error: 'url is required' }, { status: 400 })
    const optimized = await optimizeWebsiteContent({ url, section, current_content: body.current_content ?? '', language: typeof body.language === 'string' ? body.language : 'en' })
    return NextResponse.json(optimized)
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to optimize website content.' }, { status: 400 })
  }
}
