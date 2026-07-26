// saas/lib/supervisor/coordination/durable-coordination-store.ts
import type { SupabaseClient } from '@supabase/supabase-js'
import { SupabaseCoordinationStore } from './supabase-coordination-store.ts'
import { InMemoryCoordinationStore, type CoordinationStore } from './index.ts'

// `runtime` is supplied by the caller — never read from the environment here. This is
// portable core: a buyer imports it into their own deployment, where NODE_ENV means
// whatever their build system decided and may not exist at all. Reading it inside the
// core would silently pick a coordination strategy on their behalf. Every platform
// caller (the webhook routes, the observation crons, the internal health route) already
// passes `runtime: process.env.NODE_ENV` explicitly, so removing the fallback changes
// no behaviour on the test rig. Mirrors createSupervisorDispatchStore in
// ../executors/dispatch-store.ts, which made the same move first.
//
// Absent an explicit runtime the default is 'development', which still fails closed:
// without a durable store the throw below fires rather than silently coordinating
// in memory.
export function createSupervisorCoordinationStore(input: { supabase?: SupabaseClient<any, any, any>; runtime?: 'production'|'test'|'development'; allowInMemory?: boolean }): CoordinationStore {
  const runtime = input.runtime ?? 'development'
  if (runtime === 'test' || input.allowInMemory) return new InMemoryCoordinationStore()
  if (!input.supabase) throw new Error('Durable Supervisor coordination store unavailable; production never falls back to in-memory coordination.')
  return new SupabaseCoordinationStore(input.supabase)
}
export { SupabaseCoordinationStore } from './supabase-coordination-store.ts'
