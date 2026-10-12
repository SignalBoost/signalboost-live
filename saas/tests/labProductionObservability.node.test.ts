import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const logger = readFileSync(new URL('../lib/lab/observability.ts', import.meta.url), 'utf8')
const routes = [
  ['workspace/route.ts', ['workspace.create']],
  ['providers/route.ts', ['providers.list', 'providers.save', 'providers.revoke']],
  ['training/route.ts', ['training.list', 'training.action']],
  ['training/download/route.ts', ['artifact.download']],
  ['training/callback/[token]/route.ts', ['training.callback']],
]
test('LAB telemetry excludes user payload and credentials', () => {
  assert.match(logger, /randomUUID/)
  assert.match(logger, /console\.log\(JSON\.stringify\(record\)\)/)
  for (const forbidden of ['req.body', 'request.body', 'JSON.stringify(req)', 'organizationId,', 'userId,', 'rawBody,', 'token,', 'secret,']) {
    assert.equal(logger.includes(forbidden), false, forbidden)
  }
})
test('LAB customer endpoints wrap live responses in structured observability', () => {
  for (const [file, operations] of routes) {
    const content = readFileSync(new URL('../app/api/lab/' + file, import.meta.url), 'utf8')
    for (const op of operations) assert.ok(content.includes("observeLabRequest('" + op + "'"), file + ' ' + op)
  }
})
test('handler exceptions cannot be swallowed by logging', () => {
  assert.match(logger, /finally \{/)
  assert.match(logger, /outcome = 'response'/)
  assert.doesNotMatch(logger, /catch\s*\([^)]*\)\s*\{\s*return/)
})
