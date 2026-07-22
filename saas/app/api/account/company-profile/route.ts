// saas/app/api/account/company-profile/route.ts
// A signed-in user's own company identity. Every user of this platform is a different company;
// their generated work (ads, outreach, videos, sites) must carry THEIR name — never the
// platform's. This is the read/write surface behind the "add your company" prompt.
import { NextRequest, NextResponse } from 'next/server'
import { getAccess } from '@/lib/auth/access'
import { getAdminSupabase } from '@/utils/supabase/server'

export const dynamic = 'force-dynamic'
function str(v: unknown): string { return String(v ?? '').trim() }

export async function GET() {
  const access = await getAccess().catch(() => null)
  if (!access?.userId) return NextResponse.json({ ok: false, error: 'sign_in_required' }, { status: 401 })
  try {
    const db = getAdminSupabase()
    const { data } = await db.from('user_company_profile').select('*').eq('user_id', access.userId).limit(1)
    const profile = (Array.isArray(data) ? data[0] : null) || null
    return NextResponse.json({ ok: true, profile, hasProfile: Boolean(profile?.brand_name || profile?.legal_name) })
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || 'load_failed' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 }) }

  const access = await getAccess().catch(() => null)
  if (!access?.userId) return NextResponse.json({ ok: false, error: 'sign_in_required' }, { status: 401 })

  const brand = str(body?.brand_name)
  const legal = str(body?.legal_name)
  if (!brand && !legal) return NextResponse.json({ ok: false, error: 'company_name_required' }, { status: 400 })

  try {
    const db = getAdminSupabase()
    const row = {
      user_id: access.userId,
      brand_name: brand || null,
      legal_name: legal || null,
      website: str(body?.website) || null,
      products: str(body?.products) || null,
      boilerplate: str(body?.boilerplate) || null,
      spokesperson_name: str(body?.spokesperson_name) || null,
      spokesperson_title: str(body?.spokesperson_title) || null,
      approved_quote: str(body?.approved_quote) || null,
      permitted_claims: str(body?.permitted_claims) || null,
      forbidden_claims: str(body?.forbidden_claims) || null,
      updated_at: new Date().toISOString(),
    }
    const { error } = await db.from('user_company_profile').upsert(row, { onConflict: 'user_id' })
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true })
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || 'save_failed' }, { status: 500 })
  }
}
