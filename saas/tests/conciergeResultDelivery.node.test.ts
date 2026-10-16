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
  assert.match(preview, /patch\|diff/)
  assert.match(homepage, /<BuilderFilePreviews workspaceId=\{turn\.builderWorkspaceId\} files=\{turn\.builderFiles\}/)
  assert.match(concierge, /<BuilderFilePreviews workspaceId=\{message\.builderWorkspaceId\} files=\{message\.builderFiles\}/)
})

test('failed repairs create a copy-ready TXT result and file-view commands are not verification', () => {
  const runner = read('../lib/builder/job-runner.ts')
  const narration = read('../lib/builder/operator-narration.ts')
  assert.match(runner, /workspace\.writeFile\(job\.workspaceId, 'builder-result\.txt'/)
  assert.match(narration, /function isProvingCommand/)
  assert.match(narration, /successfulRuns = trace\.filter[\s\S]*isProvingCommand/)
})

test('verified repository repairs create a TXT deliverable before repository mutation', () => {
  const repair = read('../lib/builder/repository-repair.ts')
  assert.match(repair, /BUILDER_RESULT_TEXT_PATH = 'builder-result\.txt'/)
  assert.match(repair, /workspace\.writeFile\(input\.workspaceId, BUILDER_RESULT_TEXT_PATH, `\$\{result\.answer\.trim\(\)\}\\n`\)[\s\S]*const writeback = await publishSignalBoostRepositoryRepair/)
  assert.equal((repair.match(/workspace\.writeFile\(input\.workspaceId, BUILDER_RESULT_TEXT_PATH/g) || []).length, 2)
  assert.match(repair, /const finalReply = [\s\S]*reply: finalReply,[\s\S]*files,/)
})

test('homepage Concierge is visibly an assistant workspace, not the old landing card', () => {
  const layout = read('../app/layout.tsx')
  const homepage = read('../app/page.tsx')
  const workspaceCss = read('../app/concierge-workspace.css')

  assert.match(layout, /import '\.\/concierge-workspace\.css'/)
  assert.match(workspaceCss, /body:has\(\.sb-ai-app-shell--home\) > footer\s*\{[\s\S]*display:\s*none;/)
  // One rendering canvas, prompt pinned at the bottom, no centered box and no cards.
  assert.match(workspaceCss, /\.concierge-shell\s*\{[\s\S]*?display:\s*flex;[\s\S]*?flex-direction:\s*column;[\s\S]*?width:\s*100%;[\s\S]*?\}/)
  assert.doesNotMatch(workspaceCss, /\.concierge-shell\s*\{[^}]*max-width:\s*\d/)
  assert.doesNotMatch(workspaceCss, /grid-template-columns/)
  assert.match(workspaceCss, /\.concierge-shell \.composer-area\s*\{[\s\S]*?position:\s*sticky;[\s\S]*?bottom:\s*0;/)
  assert.match(workspaceCss, /\.concierge-shell \.welcome-card\s*\{[\s\S]*?justify-content:\s*flex-end;[\s\S]*?text-align:\s*start;/)
  assert.match(workspaceCss, /\.concierge-shell \.message\s*\{[\s\S]*?border:\s*0;[\s\S]*?background:\s*transparent;[\s\S]*?box-shadow:\s*none;/)
  assert.match(workspaceCss, /\.concierge-shell \.user-message\s*\{[\s\S]*?border-inline-start:/)
  assert.match(workspaceCss, /\.concierge-shell > \.cos-home-history\s*\{[\s\S]*?position:\s*absolute;/)
  // History is a permanent left column on desktop and starts closed on phones.
  assert.match(homepage, /const \[savedChatsOpen, setSavedChatsOpen\] = useState\(true\)/)
  assert.match(homepage, /if \(isPhoneWidth\(\)\) setSavedChatsOpen\(false\)/)
  assert.match(workspaceCss, /\.concierge-shell > \.cos-home-history\.is-open \{ width: 250px;/)
  assert.doesNotMatch(homepage, /welcome-actions|welcome-mark|header-copy/)
  assert.match(homepage, /<h1 className="sr-only">\{copy\.chatTitle\}<\/h1>/)

  // Existing artifact capabilities remain on the same surface: readable/copyable text previews,
  // direct downloads, and inline HTML preview. The visual correction changes layout only.
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
