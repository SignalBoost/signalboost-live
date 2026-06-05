import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { saasSupabaseCookieOptions } from '@/lib/auth/cookies'
import { cookies } from 'next/headers'

export const dynamic = 'force-dynamic'

async function getClientAndUser() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: saasSupabaseCookieOptions,
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            )
          } catch {
            // Called from a Server Component — safe to ignore
          }
        },
      },
    },
  )
  const { data: { user } } = await supabase.auth.getUser()
  return { supabase, user }
}

const VALID_TYPES = ['email', 'social', 'ads', 'outreach', 'other']
const VALID_STATUS = ['draft', 'active', 'paused', 'completed']

function cleanMetrics(input: any): Record<string, number> {
  const out: Record<string, number> = {}
  if (input && typeof input === 'object') {
    for (const key of ['sent', 'opened', 'clicked', 'converted', 'spend', 'revenue']) {
      const v = Number(input[key])
      if (!isNaN(v) && v >= 0) out[key] = v
    }
  }
  return out
}

// List the signed-in user's campaigns
export async function GET() {
  const { supabase, user } = await getClientAndUser()
  if (!user?.id) return NextResponse.json({ campaigns: [] }, { status: 401 })

  const { data, error } = await supabase
    .from('marketing_campaigns')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ campaigns: [], error: error.message }, { status: 500 })
  return NextResponse.json({ campaigns: data || [] })
}

// Create a campaign
export async function POST(req: NextRequest) {
  const { supabase, user } = await getClientAndUser()
  if (!user?.id) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const name = String(body?.name || '').trim()
  if (!name) return NextResponse.json({ error: 'Campaign name is required.' }, { status: 400 })

  const type = VALID_TYPES.includes(body?.type) ? body.type : 'email'
  const status = VALID_STATUS.includes(body?.status) ? body.status : 'draft'
  const abVariant = body?.ab_variant === 'A' || body?.ab_variant === 'B' ? body.ab_variant : null

  const row: Record<string, any> = {
    user_id: user.id,
    name,
    type,
    status,
    channel: body?.channel ? String(body.channel).trim() : null,
    goal: body?.goal ? String(body.goal).trim() : null,
    audience: body?.audience ? String(body.audience).trim() : null,
    ab_variant: abVariant,
    ab_group_id: body?.ab_group_id || null,
    metrics: cleanMetrics(body?.metrics),
    starts_at: /^\d{4}-\d{2}-\d{2}$/.test(body?.starts_at || '') ? body.starts_at : null,
    ends_at: /^\d{4}-\d{2}-\d{2}$/.test(body?.ends_at || '') ? body.ends_at : null,
    notes: body?.notes ? String(body.notes).trim() : null,
  }

  const { data, error } = await supabase
    .from('marketing_campaigns')
    .insert(row)
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ campaign: data })
}

// Update a campaign (status, metrics, fields)
export async function PATCH(req: NextRequest) {
  const { supabase, user } = await getClientAndUser()
  if (!user?.id) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const id = String(body?.id || '').trim()
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const patch: Record<string, any> = {}
  if (typeof body.name === 'string' && body.name.trim()) patch.name = body.name.trim()
  if (VALID_TYPES.includes(body.type)) patch.type = body.type
  if (VALID_STATUS.includes(body.status)) patch.status = body.status
  if ('channel' in body) patch.channel = body.channel ? String(body.channel).trim() : null
  if ('goal' in body) patch.goal = body.goal ? String(body.goal).trim() : null
  if ('audience' in body) patch.audience = body.audience ? String(body.audience).trim() : null
  if (body.ab_variant === 'A' || body.ab_variant === 'B' || body.ab_variant === null) patch.ab_variant = body.ab_variant
  if ('ab_group_id' in body) patch.ab_group_id = body.ab_group_id || null
  if ('metrics' in body) patch.metrics = cleanMetrics(body.metrics)
  if ('starts_at' in body) patch.starts_at = /^\d{4}-\d{2}-\d{2}$/.test(body.starts_at || '') ? body.starts_at : null
  if ('ends_at' in body) patch.ends_at = /^\d{4}-\d{2}-\d{2}$/.test(body.ends_at || '') ? body.ends_at : null
  if ('notes' in body) patch.notes = body.notes ? String(body.notes).trim() : null

  if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 })

  const { data, error } = await supabase
    .from('marketing_campaigns')
    .update(patch)
    .eq('id', id)
    .eq('user_id', user.id)
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ campaign: data })
}

// Delete a campaign
export async function DELETE(req: NextRequest) {
  const { supabase, user } = await getClientAndUser()
  if (!user?.id) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const { error } = await supabase
    .from('marketing_campaigns')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
