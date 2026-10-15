import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const page = readFileSync(new URL('../app/dashboard/developer/page.tsx', import.meta.url), 'utf8')
test('Builder POST transport loss never silently replays a durable job', () => {
  assert.match(page, /const response = await fetch\('\/api\/builder', \{/)
  assert.match(page, /if \(cause instanceof TypeError\) \{[\s\S]*?No automatic retry was sent\./)
  assert.match(page, /await loadWorkspaces\(\)/)
  assert.doesNotMatch(page, /catch \(cause\)[\s\S]{0,400}fetch\('\/api\/builder',\s*\{\s*method:\s*'POST'/)
})
