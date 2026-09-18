import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const assistantPage = readFileSync(new URL('../app/dashboard/assistant/page.tsx', import.meta.url), 'utf8')
const progressClient = readFileSync(new URL('../lib/ai/cos/agentProgressClient.ts', import.meta.url), 'utf8')
const browserRoute = readFileSync(new URL('../app/api/cos-browser/route.ts', import.meta.url), 'utf8')
const homepageWorkspaceCss = readFileSync(new URL('../app/concierge-workspace.css', import.meta.url), 'utf8')

test('Full Assistant live page uses observable progress and the canonical COS browser ingress', () => {
  assert.match(assistantPage, /postWithAgentProgress\(\{/)
  assert.match(assistantPage, /target: 'cos'/)
  assert.match(progressClient, /const endpoint = builderRequest\?\.endpoint \?\? '\/api\/cos-browser'/)
  assert.match(progressClient, /'x-signalboost-surface': args\.target/)
})

test('Full Assistant passive operational logs are diagnosis-only until explicit repair intent', () => {
  assert.match(browserRoute, /const ownerSoftwareAuthority = Object\.freeze\(\{ allowRepositoryRepair: true \}\)/)
  assert.match(browserRoute, /const shouldConsultSoftwareSpecialist = !operationalEvidence \|\| hasSourceAttachment \|\| explicitOperationalRepair/)
  assert.match(browserRoute, /allowRepositoryRepair: ownerSoftwareAuthority\.allowRepositoryRepair && \(!operationalEvidence \|\| explicitOperationalRepair\)/)
  assert.match(browserRoute, /if \(operationalEvidence && !hasSourceAttachment\)/)
  assert.match(browserRoute, /await diagnoseOperationalLog\(\{/)
})

test('Full Assistant carries a passive operational log into the next explicit fix-it turn on the server', () => {
  assert.match(browserRoute, /const followupOperationalRepair = hasExplicitOperationalLogRepairIntent\(prompt\)/)
  assert.match(browserRoute, /isPastedOperationalLog\(previousUserPrompt\)/)
  assert.match(browserRoute, /compactOperationalLogForRepair\(previousUserPrompt\)/)
  assert.match(browserRoute, /const operationalPrompt = followupOperationalRepair/)
})

test('Full Assistant does not let an old reverse-order fix-it authorize a later log', () => {
  assert.match(browserRoute, /const immediatePreviousMessage = latestUserIndex > 0 \? messages\[latestUserIndex - 1\] : null/)
  assert.match(browserRoute, /reverseImmediateOperationalRepair = isPastedOperationalLog\(prompt\)/)
  assert.match(browserRoute, /immediatePreviousMessage\?\.role === 'user'/)
  assert.doesNotMatch(browserRoute, /pastedOperationalLog && hasExplicitOperationalLogRepairIntent\(previousUserPrompt\)/)
})

test('Full Assistant source-backed coding remains owned by the server-side Software Specialist', () => {
  assert.match(browserRoute, /const hasSourceAttachment =/)
  assert.match(browserRoute, /tryCosSoftwareSpecialist\(\{/)
  assert.match(browserRoute, /surface: 'assistant'/)
  assert.match(browserRoute, /hasSourceAttachment \|\| explicitOperationalRepair/)
})

test('Full Assistant durable Builder polling survives transient read-only transport losses', () => {
  assert.match(progressClient, /\/api\/builder\?jobId=/)
  assert.match(progressClient, /Builder is still durable; a status check was lost/)
  assert.match(progressClient, /without replaying the action/)
  assert.match(progressClient, /if \(!poll\.ok && poll\.status >= 500\)/)
  assert.match(progressClient, /source: 'assistant-transport-unconfirmed'/)
})

test('Homepage Concierge renders assistant content full bleed without visual card chrome or page-wide horizontal scrolling', () => {
  assert.match(homepageWorkspaceCss, /\.concierge-shell \.exchange\s*\{[\s\S]*?width:\s*100%\s*!important;[\s\S]*?max-width:\s*none\s*!important;/)
  assert.match(homepageWorkspaceCss, /\.concierge-shell \.assistant-message\s*\{[\s\S]*?width:\s*100%\s*!important;[\s\S]*?max-width:\s*none\s*!important;/)
  assert.match(homepageWorkspaceCss, /\.concierge-shell \[data-concierge-visual-preview="true"\]\s*\{[\s\S]*?aspect-ratio:\s*auto\s*!important;[\s\S]*?padding:\s*0\s*!important;[\s\S]*?border:\s*0\s*!important;[\s\S]*?background:\s*transparent\s*!important;/)
  assert.match(homepageWorkspaceCss, /\.concierge-shell \.thread\s*\{[\s\S]*?overflow-x:\s*hidden\s*!important;/)
  assert.match(homepageWorkspaceCss, /\.concierge-shell \.assistant-message pre\s*\{[\s\S]*?overflow-x:\s*auto;/)
})