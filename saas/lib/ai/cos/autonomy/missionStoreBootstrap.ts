import { createClient } from '@supabase/supabase-js'

const TABLE = 'cos_autonomy_state'

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

function missingTable(message: string): boolean {
  return /cos_autonomy_state/i.test(message) && /(schema cache|could not find|does not exist|42P01)/i.test(message)
}

const BOOTSTRAP_SQL = `
create table if not exists public.cos_autonomy_state (
  mission_id text primary key,
  state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.cos_autonomy_state enable row level security;
comment on table public.cos_autonomy_state is
  'Server-side durable state for COS autonomous mission leadership ticks.';
notify pgrst, 'reload schema';
`

export interface MissionStoreReadiness {
  ok: boolean
  repaired: boolean
  error?: string
}

/**
 * COS infrastructure self-recovery boundary.
 *
 * A missing mission table is not a reason to abandon an owner mission. When the
 * service-role-only migration RPC is available, COS creates its required durable
 * state table, refreshes PostgREST, verifies the repair, and continues. Other
 * persistence failures remain fail-closed and are reported accurately.
 */
export async function ensureCosMissionStore(): Promise<MissionStoreReadiness> {
  const db = admin()
  if (!db) return { ok: false, repaired: false, error: 'Supabase service role is not configured.' }

  const probe = await db.from(TABLE).select('mission_id').limit(1)
  if (!probe.error) return { ok: true, repaired: false }
  if (!missingTable(probe.error.message || '')) {
    return { ok: false, repaired: false, error: probe.error.message }
  }

  const repair = await db.rpc('hub_exec_sql', { query: BOOTSTRAP_SQL })
  if (repair.error) {
    return {
      ok: false,
      repaired: false,
      error: `COS mission-store self-repair failed: ${repair.error.message}`,
    }
  }
  if (repair.data && typeof repair.data === 'object' && 'error' in repair.data) {
    return {
      ok: false,
      repaired: false,
      error: `COS mission-store self-repair failed: ${String((repair.data as any).error)}`,
    }
  }

  // PostgREST schema reload is asynchronous. Retry briefly inside the same request so
  // the original owner mission can continue without requiring another prompt.
  let lastError = ''
  for (let attempt = 0; attempt < 4; attempt += 1) {
    if (attempt > 0) await new Promise(resolve => setTimeout(resolve, 250 * attempt))
    const verify = await db.from(TABLE).select('mission_id').limit(1)
    if (!verify.error) return { ok: true, repaired: true }
    lastError = verify.error.message || lastError
  }

  return {
    ok: false,
    repaired: true,
    error: lastError || 'Mission store was created but PostgREST has not exposed it yet.',
  }
}
