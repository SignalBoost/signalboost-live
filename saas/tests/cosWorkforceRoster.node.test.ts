//
// Owner direction 2026-09-29: "they cannot be in the university". Graduates leave the University at graduation
// and are hired into the Workforce; the University keeps the diploma record. COS hires from the Workforce.
// Lifecycle behaviour (backfill, hire, retire, re-hire, University never blocked, authority never expanded) was
// proven on PostgreSQL 16 against the real registry migrations; these tests lock the contract in the gate.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const migration = read('supabase/migrations/20260930020000_cos_workforce_roster.sql')
const runtime = read('lib/ai/cos/cosUniversityGraduateRuntime.ts')

test('the Workforce is its own roster, linked to the University diploma, never expanding authority', () => {
  assert.match(migration, /create table if not exists public\.cos_workforce_roster/)
  assert.match(migration, /registry_id uuid not null unique references public\.cos_university_graduate_model_registry\(id\)/)
  assert.match(migration, /status text not null default 'on_call' check \(status in \('on_call', 'retired'\)\)/)
  assert.match(migration, /authority_expanded boolean not null default false check \(authority_expanded = false\)/)
  assert.doesNotMatch(migration, /base_url|api_key|secret text/i, 'no URL or secret is stored in the roster')
  assert.match(migration, /revoke all on table public\.cos_workforce_roster from public, anon, authenticated/)
})

test('hiring and retiring follow the diploma record automatically', () => {
  assert.match(migration, /if new\.status = 'active' then\s+insert into public\.cos_workforce_roster/)
  assert.match(migration, /elsif tg_op = 'UPDATE' and old\.status = 'active' then\s+update public\.cos_workforce_roster\s+set status = 'retired'/)
  assert.match(migration, /after insert or update of status, platform_scope, runtime_provider, runtime_model_id\s+on public\.cos_university_graduate_model_registry/)
  assert.match(migration, /where g\.status = 'active'\s+on conflict \(registry_id\) do nothing;/, 'graduates already active are hired once')
})

test('a Workforce failure can never block a University activation, quarantine or retirement', () => {
  assert.match(migration, /exception when others then\s+raise warning 'cos_workforce_roster sync skipped/)
  assert.match(migration, /return new;/)
})

test('COS hires only on-call Workforce graduates and still re-checks every gate on the diploma', () => {
  assert.match(runtime, /COS_WORKFORCE_ROSTER_TABLE = 'cos_workforce_roster'/)
  assert.match(runtime, /\.eq\('status', 'on_call'\)\s+\.eq\('authority_expanded', false\)/)
  assert.match(runtime, /if \(!onCall \|\| !onCall\.length\) return \[\]/, 'an unreadable or empty roster fails closed')
  const read = runtime.slice(runtime.indexOf('export async function activeGraduateRuntimesForRole'))
  assert.ok(read.indexOf('onCallWorkforceRegistryIds(db)') < read.indexOf("from('cos_university_graduate_model_registry')"))
  assert.match(read, /\.eq\('status', 'active'\)\s+\.in\('id', onCall\)/)
  assert.match(read, /HEX64\.test\(clean\(row\.runtime_health_evidence_hash, 64\)\)/)
  assert.match(read, /HEX64\.test\(clean\(row\.activation_evidence_hash, 64\)\)/)
})
