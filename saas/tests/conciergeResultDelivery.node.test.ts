import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')

test('Builder text files render inline with a copy control on both public Concierge surfaces', () => {
  const preview = read('../components/BuilderFilePreviews.tsx')
  const homepage = read('../app/page.tsx')
  const concierge = read('../components/Concierge.tsx')
  assert.match(preview, /navigator\.clipboard\.writeText\(content\)/)
  assert.match(preview, /<pre[\s\S]*<code>\{content\}<\/code><\/pre>/)
  assert.match(preview, /MAX_INLINE_CHARS = 120_000/)
  assert.match(homepage, /<BuilderFilePreviews workspaceId=\{turn\.builderWorkspaceId\} files=\{turn\.builderFiles\}/)
  assert.match(concierge, /<BuilderFilePreviews workspaceId=\{message\.builderWorkspaceId\} files=\{message\.builderFiles\}/)
})

test('TXT and PDF follow-ups convert the actual preceding Builder file instead of losing context', () => {
  const artifact = read('../app/api/artifacts/route.ts')
  const homepage = read('../app/page.tsx')
  const concierge = read('../components/Concierge.tsx')
  const transport = read('../components/AssistantTransportBoundary.tsx')
  assert.match(artifact, /sourceWorkspaceId/)
  assert.match(artifact, /workspace\.readFile\(workspaceId, sourcePath\)/)
  assert.match(artifact, /SOURCE MATERIAL FROM THE CURRENT CONVERSATION/)
  for (const source of [homepage, concierge]) {
    assert.match(source, /sourceWorkspaceId/)
    assert.match(source, /sourcePath/)
    assert.match(source, /Give me that result as a TXT file\./)
    assert.match(source, /Give me that result as a PDF file\./)
  }
  assert.match(transport, /sourceText:[\s\S]{0,220}role === 'assistant'/)
})

test('log-only diagnostic questions reach COS while unattached logs remain excluded from Builder', () => {
  const browser = read('../app/api/cos-browser/route.ts')
  const policy = read('../lib/ai/cos/cosReasoningRolePolicy.ts')
  assert.doesNotMatch(browser, /if \(pastedOperationalLog && !hasSourceAttachment\)/)
  assert.match(browser, /Passive logs carry evidence but no execution authority/)
  assert.match(policy, /isOperationalLogEvidence\(raw\) && !sourceAttachment\(context\)/)
})

test('public Concierge uses the canonical browser ingress instead of a second routing stack', () => {
  const progressClient = read('../lib/ai/cos/agentProgressClient.ts')
  assert.match(progressClient, /args\.target === 'cos' \? '\/api\/cos-primary' : '\/api\/cos-browser'/)
  assert.doesNotMatch(progressClient, /args\.target === 'cos' \? '\/api\/cos-primary' : '\/api\/concierge'/)
})
