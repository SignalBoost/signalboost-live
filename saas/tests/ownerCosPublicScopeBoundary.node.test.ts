import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const saasRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const read = (relative: string) => readFileSync(resolve(saasRoot, relative), 'utf8')

test('owner Assistant is not wrapped in public-delivery scope at browser ingress', () => {
  const source = read('app/api/cos-browser/route.ts')
  assert.match(source, /const response = access\?\.isOwner\s*\? await executeRoutedRequest\(\)/)
  assert.match(source, /: await withPublicAuditIdentity\([\s\S]{0,240}withPublicDeliveryScope\(\(\) => executeRoutedRequest\(\)\)/)
  assert.doesNotMatch(source, /access\?\.isOwner[\s\S]{0,180}withPublicDeliveryScope\(\(\) => executeRoutedRequest\(\)\)/)
})

test('owner provenance introspection bypasses the public browser interceptor', () => {
  const source = read('app/api/cos-browser/route.ts')
  assert.match(source, /!access\?\.isOwner && isProvenanceIntrospection\(prompt\)/)
})

test('COS has a deterministic privileged platform-stack response', () => {
  const source = read('lib/ai/cos/cosFirstAnswer.ts')
  assert.match(source, /function ownerPlatformStackReply/)
  assert.match(source, /process\.env\.LOCAL_AI_MODEL \|\| 'Qwen\/Qwen3\.6-35B-A3B'/)
  assert.match(source, /isPublicDeliveryScope\(\)\s*\? publicImplementationDisclosureReply\(input\.language\)\s*:\s*ownerPlatformStackReply\(input\.language\)/)
})
