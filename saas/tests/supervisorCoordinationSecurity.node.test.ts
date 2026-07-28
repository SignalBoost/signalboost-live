import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { hydrateLocalizedSource } from './helpers/hydrateLocalizedSource.ts'


const baseSql = hydrateLocalizedSource(readFileSync(
  new URL('../supabase/migrations/20260716_supervisor_federated_coordination.sql', import.meta.url),
  'utf8',
))
const hardeningSql = hydrateLocalizedSource(readFileSync(
  new URL('../supabase/migrations/20260718_supervisor_coordination_security_hardening.sql', import.meta.url),
  'utf8',
))

const tables = [
  'supervisor_instances',
  'supervisor_work_items',
  'supervisor_leases',
  'supervisor_coordination_events',
]

const mutationRpcs = [
  'supervisor_acquire_lease',
  'supervisor_assert_fence',
  'supervisor_renew_lease',
  'supervisor_release_lease',
  'supervisor_transition_work_item',
  'supervisor_reconcile_expired_leases',
  'supervisor_enqueue_work_item',
  'supervisor_heartbeat_instance',
  'supervisor_mark_instance_status',
]

test('coordination tables have RLS and authenticated read-only policies', () => {
  for (const table of tables) {
    assert.match(baseSql, new RegExp(`alter table public\\.${table} enable row level security`, 'i'))
    assert.match(baseSql, new RegExp(`create policy [^;]+ on public\\.${table} for select`, 'i'))
  }

  assert.match(hardeningSql, /revoke insert, update, delete, truncate, references, trigger[\s\S]+from anon, authenticated;/i)
  assert.match(hardeningSql, /grant select on table[\s\S]+to authenticated;/i)
  assert.doesNotMatch(hardeningSql, /grant\s+(insert|update|delete|truncate|execute)[\s\S]+to\s+(anon|authenticated)/i)
})

test('every coordination mutation RPC is denied to browser roles', () => {
  for (const rpc of mutationRpcs) {
    assert.match(baseSql, new RegExp(`create or replace function public\\.${rpc}\\b`, 'i'))
    assert.match(
      hardeningSql,
      new RegExp(`revoke execute on function public\\.${rpc}\\([^;]+from anon, authenticated;`, 'i'),
      `${rpc} must be revoked from anon and authenticated`,
    )
  }
})

test('security-definer RPCs pin the search path', () => {
  for (const rpc of mutationRpcs) {
    const start = baseSql.search(new RegExp(`create or replace function public\\.${rpc}\\b`, 'i'))
    assert.notEqual(start, -1, `${rpc} must exist`)
    const nextFunction = baseSql.indexOf('create or replace function', start + 1)
    const definition = baseSql.slice(start, nextFunction === -1 ? undefined : nextFunction)
    assert.match(definition, /security definer/i, `${rpc} must use SECURITY DEFINER`)
    assert.match(definition, /set search_path=public/i, `${rpc} must pin search_path`)
  }
})

test('coordination SQL never grants mutation access to public roles', () => {
  const combined = `${baseSql}\n${hardeningSql}`
  assert.doesNotMatch(combined, /grant\s+execute\s+on\s+function[\s\S]+to\s+(anon|authenticated)/i)
  assert.doesNotMatch(combined, /grant\s+(insert|update|delete|truncate)[\s\S]+to\s+(anon|authenticated)/i)
})
