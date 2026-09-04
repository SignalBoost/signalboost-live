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

test('homepage Concierge is a full working surface rather than a permanent landing card', () => {
  const layout = read('../app/layout.tsx')
  const homepage = read('../app/page.tsx')
  const workspaceCss = read('../app/concierge-workspace.css')

  assert.match(layout, /import '\.\/concierge-workspace\.css'/)
  assert.match(workspaceCss, /\.concierge-shell\s*\{[\s\S]*min-height:\s*calc\(100svh/)
  assert.match(workspaceCss, /\.concierge-shell \.welcome-card\s*\{[\s\S]*flex:\s*1 1 auto !important;[\s\S]*border:\s*0 !important;[\s\S]*background:\s*transparent !important;/)
  assert.match(workspaceCss, /a\[href="\/dashboard\/assistant"\][\s\S]*display:\s*none !important;/)
  assert.match(workspaceCss, /\.concierge-shell \.thread\s*\{[\s\S]*max-height:\s*none !important;[\s\S]*overflow/)
  assert.match(workspaceCss, /\.concierge-shell \.composer-area\s*\{[\s\S]*position:\s*sticky !important;[\s\S]*bottom:\s*0;/)
  assert.match(workspaceCss, /\.concierge-shell \.assistant-message\s*\{[\s\S]*1220px/)

  // Existing artifact capabilities remain on the same surface: readable/copyable text previews,
  // direct downloads, and inline HTML preview. The redesign changes layout, not execution authority.
  assert.match(homepage, /<BuilderFilePreviews workspaceId=\{turn\.builderWorkspaceId\} files=\{turn\.builderFiles\}/)
  assert.match(homepage, /download=\{path\.split\('\/'\)\.pop\(\) \|\| 'download\.txt'\}/)
  assert.match(homepage, /<iframe[\s\S]*\?preview=1/)
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

test('unattached operational logs use bounded diagnosis and stay out of ordinary Builder', () => {
  const browser = read('../app/api/cos-browser/route.ts')
  const diagnostic = read('../lib/ai/cos/operationalLogDiagnostic.ts')
  const policy = read('../lib/ai/cos/cosReasoningRolePolicy.ts')
  assert.match(browser, /if \(operationalEvidence && !hasSourceAttachment\)/)
  assert.match(browser, /await diagnoseOperationalLog\(/)
  assert.match(browser, /concierge-operational-log-diagnostic/)
  assert.match(diagnostic, /Do not execute tools, edit files/)
  assert.match(diagnostic, /operationalLogReply\(input\.log\)/)
  assert.match(policy, /isOperationalLogEvidence\(raw\) && !sourceAttachment\(context\)/)
})
