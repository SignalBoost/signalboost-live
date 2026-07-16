import type { SupabaseClient } from '@supabase/supabase-js'
import { SupabaseCoordinationStore } from './supabase-coordination-store.ts'
import { InMemoryCoordinationStore, type CoordinationStore } from './index.ts'

export function createSupervisorCoordinationStore(input: { supabase?: SupabaseClient<any, any, any>; runtime?: 'production'|'test'|'development'; allowInMemory?: boolean }): CoordinationStore {
  const runtime = input.runtime ?? (process.env.NODE_ENV as 'production'|'test'|'development' | undefined) ?? 'development'
  if (runtime === 'test' || input.allowInMemory) return new InMemoryCoordinationStore()
  if (!input.supabase) throw new Error('Durable Supervisor coordination store unavailable; production never falls back to in-memory coordination.')
  return new SupabaseCoordinationStore(input.supabase)
}
export { SupabaseCoordinationStore } from './supabase-coordination-store.ts'
