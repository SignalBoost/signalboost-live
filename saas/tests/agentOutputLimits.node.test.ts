import test from 'node:test'
import assert from 'node:assert/strict'

import { sanitizeSandboxArtifacts } from '../lib/agent-runtime/artifact-sanitizer.ts'
import { DEFAULT_SANDBOX_RUNTIME_POLICY, truncateSandboxOutput } from '../lib/agent-runtime/policy.ts'
import type { SandboxArtifact } from '../lib/agent-runtime/contracts.ts'

test('stdout and stderr truncate at configured byte limits', () => {
  assert.deepEqual(truncateSandboxOutput('abcdef', 4), { value: 'abcd', truncated: true })
  assert.deepEqual(truncateSandboxOutput('abcdef', 6), { value: 'abcdef', truncated: false })
})

function sanitize(artifacts: SandboxArtifact[], policy = DEFAULT_SANDBOX_RUNTIME_POLICY) { return sanitizeSandboxArtifacts(artifacts, 'workspace', policy) }
test('artifact limits and unsafe paths are rejected', () => {
  assert.equal(sanitize(Array.from({ length: 21 }, (_, index) => ({ path: `a-${index}.txt`, sizeBytes: 1 })))[20].rejectionReason, 'artifact_count_limit_exceeded')
  assert.equal(sanitize([{ path: 'large.bin', sizeBytes: 1024 * 1024 + 1 }])[0].rejectionReason, 'artifact_size_limit_exceeded')
  assert.equal(sanitize(Array.from({ length: 6 }, (_, index) => ({ path: `total-${index}.bin`, sizeBytes: 1024 * 1024 })))[5].rejectionReason, 'total_artifact_size_limit_exceeded')
  for (const path of ['/etc/passwd', 'C:\\secret.txt', '../secret.txt', 'bad\u0000name.txt', '.env.local']) assert.ok(sanitize([{ path, sizeBytes: 1 }])[0].rejectionReason, path)
  assert.equal(sanitize([{ path: 'link', sizeBytes: 1, kind: 'symbolic_link' }])[0].rejectionReason, 'unsafe_artifact_kind')
})

test('safe relative artifacts return metadata only', () => {
  const [artifact] = sanitize([{ path: 'reports/result.json', sizeBytes: 7, mediaType: 'application/json', content: new TextEncoder().encode('content') }])
  assert.deepEqual(Object.keys(artifact).sort(), ['mediaType', 'relativePath', 'sha256', 'sizeBytes', 'truncated'])
  assert.equal(artifact.relativePath, 'reports/result.json')
  assert.equal(artifact.mediaType, 'application/json')
  assert.equal(JSON.stringify(artifact).includes('content'), false)
})
