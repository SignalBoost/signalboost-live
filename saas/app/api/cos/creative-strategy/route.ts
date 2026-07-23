import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/outreach/security'
import { buildCosHeroStrategy, defaultCosHeroStrategyInput } from '@/lib/cos/creative-strategy'
import { resolveCompanyFacts, isSoldCopy } from '@/lib/portable/companyIdentity'
import type { CosHeroStrategyInput } from '@/lib/cos/creative-strategy'

export const dynamic = 'force-dynamic'

export async function GET() {
  const ctx = await requireAdmin()
  if (ctx instanceof NextResponse) return ctx

  const facts = (isSoldCopy() || String(process.env.PORTABLE_BRAND_NAME || '').trim()) ? await resolveCompanyFacts() : null
  const input = defaultCosHeroStrategyInput(facts)
  const strategy = buildCosHeroStrategy(input)
  return NextResponse.json({ ok: true, input, strategy })
}

export async function POST(req: NextRequest) {
  const ctx = await requireAdmin()
  if (ctx instanceof NextResponse) return ctx

  let body: Partial<CosHeroStrategyInput>
  try { body = await req.json() } catch { return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 }) }

  const facts = (isSoldCopy() || String(process.env.PORTABLE_BRAND_NAME || '').trim()) ? await resolveCompanyFacts() : null
  const defaults = defaultCosHeroStrategyInput(facts)
  const input: CosHeroStrategyInput = {
    ...defaults,
    ...body,
    languages: defaults.languages,
  }

  const strategy = buildCosHeroStrategy(input)
  return NextResponse.json({ ok: true, input, strategy })
}
