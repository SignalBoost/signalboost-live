import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/outreach/security'
import { buildCosHeroStrategy, defaultCosHeroStrategyInput } from '@/lib/cos/creative-strategy'
import type { CosHeroStrategyInput } from '@/lib/cos/creative-strategy'

export const dynamic = 'force-dynamic'

export async function GET() {
  const ctx = await requireAdmin()
  if (ctx instanceof NextResponse) return ctx

  const input = defaultCosHeroStrategyInput()
  const strategy = buildCosHeroStrategy(input)
  return NextResponse.json({ ok: true, input, strategy })
}

export async function POST(req: NextRequest) {
  const ctx = await requireAdmin()
  if (ctx instanceof NextResponse) return ctx

  let body: Partial<CosHeroStrategyInput>
  try { body = await req.json() } catch { return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 }) }

  const defaults = defaultCosHeroStrategyInput()
  const input: CosHeroStrategyInput = {
    ...defaults,
    ...body,
    languages: defaults.languages,
  }

  const strategy = buildCosHeroStrategy(input)
  return NextResponse.json({ ok: true, input, strategy })
}
