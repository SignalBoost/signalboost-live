import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { verifyBuilderInstallation } from '../scripts/verify-builder-installation.mjs'

test('Builder preflight fails closed when installation components are missing', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'builder-preflight-'))
  try {
    const empty = verifyBuilderInstallation(root)
    assert.equal(empty.ok, false)
    assert.equal(empty.productionVerified, false)
    assert.ok(empty.failures.includes('sandbox runtime'))
    mkdirSync(path.join(root, 'lib', 'builder'), { recursive: true })
    writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'partial', dependencies: { '@vercel/sandbox': '^3' } }))
    const partial = verifyBuilderInstallation(root)
    assert.equal(partial.ok, false)
    assert.ok(partial.failures.includes('dependency: @supabase/supabase-js'))
  } finally { rmSync(root, { recursive: true, force: true }) }
})
