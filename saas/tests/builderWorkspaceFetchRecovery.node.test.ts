import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

test('opening workspace preserves existing view on transient transport failure and does not submit duplicate jobs', () => {
  const source = readFileSync(new URL('../app/dashboard/developer/page.tsx', import.meta.url), 'utf8')
  const handler = source.split('async function openWorkspace(id: string) {')[1]?.split('async function addFiles(')[0] || ''
  assert.ok(handler)
  assert.doesNotMatch(handler, /setWorkspaceId\(''\)/)
  assert.doesNotMatch(handler, /setWorkspaceFiles\(\[\]\)/)
  assert.match(handler, /for \(let attempt = 0; attempt < 2; attempt \+= 1\)/)
  assert.match(handler, /response\.status >= 500/)
  assert.match(handler, /cause instanceof TypeError/)
  assert.match(handler, /Your saved workspace is unchanged/)
  assert.doesNotMatch(handler, /method: 'POST'/)
})
