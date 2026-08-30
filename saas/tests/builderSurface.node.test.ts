import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { hydrateLocalizedSource } from './helpers/hydrateLocalizedSource.ts'


const source = (path: string) => hydrateLocalizedSource(readFileSync(new URL(path, import.meta.url), 'utf8'))

test('Builder is authenticated and does not expose full tool trace content', () => {
  const route = source('../app/api/builder/route.ts')
  assert.match(route, /getAccess\(\)/)
  assert.match(route, /if \(!access\?\.userId\)/)
  assert.match(route, /publicTrace\(result\.trace\)/)
  assert.match(route, /export async function GET/)
  assert.match(route, /workspace\.listWorkspaces\(\)/)
  assert.match(route, /command: typeof input\.command/)
  assert.match(route, /stdout: result\.stdout\.slice/)
  assert.doesNotMatch(route, /trace: result\.trace/)
})

test('Builder runs only in an ephemeral network-denied Vercel Sandbox', () => {
  const runner = source('../lib/builder/vercel-sandbox-runner.ts')
  assert.match(runner, /networkPolicy: 'deny-all'/)
  assert.match(runner, /persistent: false/)
  assert.match(runner, /await sandbox\.stop\(\)/)
  assert.match(runner, /cwd: ROOT/)
})

test('Builder workspace tables are server-only and ownership constrained', () => {
  const migration = source('../supabase/migrations/20260829190749_builder_workspaces.sql')
  assert.match(migration, /references auth\.users\(id\)/)
  assert.match(migration, /enable row level security/)
  assert.match(migration, /revoke all on public\.builder_workspaces from anon, authenticated/)
  assert.match(migration, /revoke all on public\.builder_workspace_files from anon, authenticated/)
})

test('Builder retains only verified repair lessons in a server-only table', () => {
  const migration = source('../supabase/migrations/20260830004500_builder_verified_repair_lessons.sql')
  assert.match(migration, /create table if not exists public\.builder_verified_repair_lessons/)
  assert.match(migration, /references public\.builder_workspaces \(id, user_id\)/)
  assert.match(migration, /enable row level security/)
  assert.match(migration, /revoke all on public\.builder_verified_repair_lessons from anon, authenticated/)
  assert.match(migration, /Never stores raw chat history/)
})

test('Builder certification outcomes are server-only and contain no source artifacts', () => {
  const migration = source('../supabase/migrations/20260830013000_builder_certification_attempts.sql')
  assert.match(migration, /enable row level security/)
  assert.match(migration, /revoke all on public\.builder_certification_attempts from anon, authenticated/)
  assert.match(migration, /No prompts, source code, commands/)
})
