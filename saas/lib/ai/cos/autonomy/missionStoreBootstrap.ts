import { createClient } from '@supabase/supabase-js'

const TABLE = 'cos_autonomy_state'

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

function missingTable(message: string): boolean {
  return /cos_autonomy_state/i.test(message)
    && /(schema cache|could not find|does not exist|42P01|PGRST204)/i.test(message)
}

// hub_exec_sql executes one prepared statement per invocation. Keep this repair
// ordered, idempotent, and bounded so COS can safely resume after any partial step.
const BOOTSTRAP_STATEMENTS = [
  String.raw`create table if not exists public.cos_autonomy_state (
    mission_id text primary key,
    state jsonb not null default '{}'::jsonb,
    updated_at timestamptz not null default now()
  )`,
  String.raw`alter table public.cos_autonomy_state enable row level security`,
  String.raw`comment on table public.cos_autonomy_state is
    'Server-side durable state for COS autonomous mission leadership ticks.'`,
  String.raw`notify pgrst, 'reload schema'`,
] as const

export interface MissionStoreReadiness {
  ok: boolean
  repaired: boolean
  error?: string
  failedStep?: number
}

async function executeBootstrap(db: ReturnType<typeof admin>): Promise<MissionStoreReadiness> {
  if (!db) return { ok: false, repaired: false, error: 'Supabase service role is not configured.' }

  for (let index = 0; index < BOOTSTRAP_STATEMENTS.length; index += 1) {
    const repair = await db.rpc('hub_exec_sql', { query: BOOTSTRAP_STATEMENTS[index] })
    if (repair.error) {
      return {
        ok: false,
        repaired: index > 0,
        failedStep: index + 1,
        error: `COS mission-store self-repair failed at step ${index + 1}: ${repair.error.message}`,
      }
    }
    if (repair.data && typeof repair.data === 'object' && 'error' in repair.data) {
      return {
        ok: false,
        repaired: index > 0,
        failedStep: index + 1,
        error: `COS mission-store self-repair failed at step ${index + 1}: ${String((repair.data as any).error)}`,
      }
    }
  }

  return { ok: true, repaired: true }
}

/**
 * COS infrastructure self-recovery boundary.
 *
 * Missing mission persistence is a recoverable COS dependency. COS probes its
 * store, applies the exact bounded bootstrap sequence through the existing
 * service-role-only migration RPC, refreshes PostgREST, verifies the repair,
 * and then lets the original owner mission continue without another prompt.
 */
export async function ensureCosMissionStore(): Promise<MissionStoreReadiness> {
  const db = admin()
  if (!db) return { ok: false, repaired: false, error: 'Supabase service role is not configured.' }

  const probe = await db.from(TABLE).select('mission_id').limit(1)
  if (!probe.error) return { ok: true, repaired: false }
  if (!missingTable(`${probe.error.code || ''} ${probe.error.message || ''}`)) {
    return { ok: false, repaired: false, error: probe.error.message }
  }

  const repaired = await executeBootstrap(db)
  if (!repaired.ok) return repaired

  // PostgREST schema reload is asynchronous. Retry inside the same request so
  // the original mission can continue without requiring the owner to repeat it.
  let lastError = ''
  for (let attempt = 0; attempt < 6; attempt += 1) {
    if (attempt > 0) await new Promise(resolve => setTimeout(resolve, 250 * attempt))
    const verify = await db.from(TABLE).select('mission_id').limit(1)
    if (!verify.error) return { ok: true, repaired: true }
    lastError = `${verify.error.code || ''} ${verify.error.message || ''}`.trim()
  }

  // Do not misreport success merely because the DDL calls returned. The mission
  // router can now treat this as degraded infrastructure and use its fallback path.
  return {
    ok: false,
    repaired: true,
    error: lastError || 'Mission store was created but PostgREST has not exposed it yet.',
  }
}
