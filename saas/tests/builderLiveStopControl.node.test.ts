import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const boundary = readFileSync(new URL('../components/AssistantTransportBoundary.tsx', import.meta.url), 'utf8')
const api = readFileSync(new URL('../app/api/builder/route.ts', import.meta.url), 'utf8')

test('Builder status offers a real server-backed Stop action while keeping Dismiss independent', () => {
  assert.match(boundary, /aria-label="Stop Builder job"/)
  assert.match(boundary, /onClick=\{\(\) => \{ void stopLiveBuilder\(\) \}\}/)
  assert.match(boundary, /method: 'DELETE'/)
  assert.match(boundary, /encodeURIComponent\(liveJob\.jobId\)/)
  assert.match(boundary, /aria-label="Dismiss Builder status"/)
  assert.match(api, /export async function DELETE\(request: Request\)/)
  assert.match(api, /stopBuilderJobForUser\(jobId,access\.userId\)/)
})

test('Builder stop failure is never reported as successful cancellation', () => {
  assert.match(boundary, /if \(!response\.ok\) throw new Error\('builder_stop_failed'\)/)
  assert.match(boundary, /Stop request could not be confirmed/)
  assert.match(boundary, /if \(result\.stopped \|\| result\.status === 'already_finished'\)/)
})
