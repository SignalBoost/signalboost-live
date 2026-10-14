import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

test('Builder activity renders truthful durable phases and files/tests while polling', () => {
  const source = readFileSync(new URL('../app/dashboard/developer/page.tsx', import.meta.url), 'utf8')
  assert.match(source, /aria-label="Builder live activity"/)
  assert.match(source, /if \(data\.progress\) setLiveProgress\(data\.progress\)/)
  assert.match(source, /Queued for worker/)
  assert.match(source, /Checkpoint saved; awaiting continuation/)
  assert.match(source, /Files saved:/)
  assert.match(source, /Last test:/)
  assert.match(source, /Last saved activity:/)
  assert.match(source, /does not imply continuous model execution/)
  assert.match(source, /setActiveJobId\(data\.jobId\)/)
})
