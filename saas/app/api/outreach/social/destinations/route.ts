import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, auditAdminAction } from '@/lib/outreach/security'
import { SOCIAL_CONNECTORS, type SocialPlatform } from '@/lib/outreach/social-connectors'
import { discoverSocialDestinations } from '@/lib/outreach/social-destinations'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const DESTINATION_SQL = `
create table if not exists public.outreach_social_destinations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  platform text not null,
  account_ref text not null,
  account_name text,
  kind text,
  access_token text,
  metadata jsonb not null default '{}'::jsonb,
  discovered_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, platform, account_ref)
);
create index if not exists outreach_social_destinations_user_platform_idx on public.outreach_social_destinations(user_id, platform);
create index if not exists outreach_social_destinations_platform_idx on public.outreach_social_destinations(platform, discovered_at desc);
alter table public.outreach_social_destinations enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'outreach_social_destinations' and policyname = 'Admins manage social destinations') then
    create policy "Admins manage social destinations" on public.outreach_social_destinations for all using (public.is_signalboost_admin()) with check (public.is_signalboost_admin());
  end if;
end $$;
select pg_notify('pgrst', 'reload schema');
`.trim()

function isPlatform(value: string): value is SocialPlatform {
  return Boolean((SOCIAL_CONNECTORS as any)[value])
}

function sleep(ms: number) { return new Promise(resolve => setTimeout(resolve, ms)) }

async function ensureDestinationsTable(admin: any) {
  const res = await admin.from('outreach_social_destinations').select('id').limit(1)
  if (!res.error) return { ok: true, created: false }
  const setup = await admin.rpc('hub_exec_sql', { query: DESTINATION_SQL })
  if (setup.error) return { ok: false, error: setup.error.message }
  for (let i = 0; i < 5; i++) {
    const check = await admin.from('outreach_social_destinations').select('id').limit(1)
    if (!check.error) return { ok: true, created: true }
    await sleep(600)
  }
  return { ok: false, error: 'Destination table created but schema cache has not refreshed yet. Retry in a few seconds.' }
}

function safeDestination(row: any) {
  return {
    id: row.id,
    platform: row.platform,
    accountRef: row.account_ref,
    accountName: row.account_name,
    kind: row.kind,
    hasAccessToken: Boolean(row.access_token),
    metadata: row.metadata || {},
    discoveredAt: row.discovered_at,
    updatedAt: row.updated_at,
  }
}

async function loadToken(admin: any, userId: string, platform: SocialPlatform) {
  const { data } = await admin.from('outreach_social_tokens').select('*').eq('user_id', userId).eq('platform', platform).maybeSingle()
  if (data) return data
  if (platform === 'instagram_business') {
    const fb = await admin.from('outreach_social_tokens').select('*').eq('user_id', userId).eq('platform', 'facebook_pages').maybeSingle()
    return fb.data || null
  }
  return null
}

async function listStored(admin: any, userId: string, platform?: SocialPlatform) {
  let q = admin.from('outreach_social_destinations').select('*').eq('user_id', userId).order('discovered_at', { ascending: false })
  if (platform) q = q.eq('platform', platform)
  const { data, error } = await q
  if (error) return { ok: false, error: error.message, destinations: [] }
  return { ok: true, destinations: (data || []).map(safeDestination) }
}

export async function GET(req: NextRequest) {
  const ctx = await requireAdmin()
  if (ctx instanceof NextResponse) return ctx
  const ensured = await ensureDestinationsTable(ctx.admin)
  if (!ensured.ok) return NextResponse.json({ ok: false, error: ensured.error }, { status: 202 })
  const raw = req.nextUrl.searchParams.get('platform') || ''
  const platform = raw && isPlatform(raw) ? raw : undefined
  if (raw && !platform) return NextResponse.json({ ok: false, error: 'Unsupported social platform.' }, { status: 400 })
  const stored = await listStored(ctx.admin, ctx.user.id, platform)
  return NextResponse.json({ ...stored, ensured }, { status: stored.ok ? 200 : 500 })
}

export async function POST(req: NextRequest) {
  const ctx = await requireAdmin()
  if (ctx instanceof NextResponse) return ctx
  const ensured = await ensureDestinationsTable(ctx.admin)
  if (!ensured.ok) return NextResponse.json({ ok: false, error: ensured.error }, { status: 202 })

  let body: any = {}
  try { body = await req.json() } catch { body = {} }
  const platformValue = String(body?.platform || '').trim()
  if (!isPlatform(platformValue)) return NextResponse.json({ ok: false, error: 'Unsupported social platform.' }, { status: 400 })
  const platform = platformValue as SocialPlatform
  const autoSelect = body?.auto_select === true || body?.autoSelect === true

  const token = await loadToken(ctx.admin, ctx.user.id, platform)
  if (!token?.access_token) return NextResponse.json({ ok: false, error: `${platform} is not connected or has no access token.` }, { status: 409 })

  const discovered = await discoverSocialDestinations(platform, token.access_token)
  if (!discovered.ok) {
    await auditAdminAction({ admin: ctx.admin, actorId: ctx.user.id, action: 'outreach.social.destinations.discovery_failed', targetType: 'social_connector', targetId: platform, metadata: { error: discovered.error, mode: discovered.mode } })
    return NextResponse.json(discovered, { status: 502 })
  }

  const stored: any[] = []
  for (const item of discovered.destinations) {
    const { data, error } = await ctx.admin.from('outreach_social_destinations').upsert(
      {
        user_id: ctx.user.id,
        platform: item.platform,
        account_ref: item.accountRef,
        account_name: item.accountName,
        kind: item.kind,
        access_token: item.accessToken || null,
        metadata: item.metadata || {},
        discovered_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,platform,account_ref' },
    ).select('*').single()
    if (!error && data) stored.push(safeDestination(data))
  }

  let selected: any = null
  const selectable = discovered.destinations.filter(item => item.kind !== 'reddit_user_identity')
  if (autoSelect && selectable.length === 1) {
    const item = selectable[0]
    selected = item
    const patch: Record<string, unknown> = { account_ref: item.accountRef, account_name: item.accountName, updated_at: new Date().toISOString() }
    if (item.accessToken) patch.access_token = item.accessToken
    await ctx.admin.from('outreach_social_tokens').update(patch).eq('user_id', ctx.user.id).eq('platform', platform)
  }

  await auditAdminAction({ admin: ctx.admin, actorId: ctx.user.id, action: 'outreach.social.destinations.discover', targetType: 'social_connector', targetId: platform, metadata: { discovered: discovered.destinations.length, stored: stored.length, autoSelect, selected: selected ? { accountRef: selected.accountRef, accountName: selected.accountName } : null } })

  return NextResponse.json({ ok: true, mode: discovered.mode, platform, discovered: discovered.destinations.length, destinations: stored, selected, ensured })
}
