// tests/conciergeOperationalLogRouting.node.test.ts
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { detectConciergeArtifactIntent } from '../lib/artifacts/intent.ts'
import { isOperationalLogEvidence } from '../lib/ai/cos/pastedOperationalLog.ts'
import { isProvenanceIntrospection } from '../lib/ai/cos/provenanceIntrospection.ts'

const route = readFileSync(new URL('../app/api/cos-browser/route.ts', import.meta.url), 'utf8')

test('public Concierge and owner Assistant both enter the canonical browser ingress', () => {
  const proxy = readFileSync(new URL('../proxy.ts', import.meta.url), 'utf8')
  const concierge = proxy.indexOf("pathname === '/api/concierge' && req.method === 'POST'")
  const conciergeRewrite = proxy.indexOf("cosBrowserUrl.pathname = '/api/cos-browser'", concierge)
  const fullAssistant = proxy.indexOf("pathname === '/api/cos-primary' && req.method === 'POST' && isFullAssistantBrowserRequest(req)")
  const assistantRewrite = proxy.indexOf("cosBrowserUrl.pathname = '/api/cos-browser'", fullAssistant)
  assert.ok(concierge >= 0 && conciergeRewrite > concierge)
  assert.ok(fullAssistant >= 0 && assistantRewrite > fullAssistant)
})

test('repository repair is one durable server helper rather than duplicated routing code', () => {
  const helper = route.match(/async function queueOwnerRepositoryRepair[\s\S]*?\n}\n\nexport async function withSuggestedFollowups/)
  assert.ok(helper)
  const text = helper?.[0] || ''
  assert.match(text, /enqueueSignalBoostRepositoryRepairJob/)
  assert.match(text, /runBuilderJob\(job\.jobId/)
  assert.match(text, /status: 'queued'/)
  assert.match(text, /source: 'cos-platform-engineer'/)
})

test('owner repository repair prefers the exact failed snapshot before deployed fallbacks', () => {
  const analysis = route.indexOf('const operationalLogAnalysis = analyzeOperationalLog(operationalPrompt)')
  const exact = route.indexOf('const exactFailedLogTarget =', analysis)
  const ownerTarget = route.indexOf('const ownerRepositoryRepairTarget =', exact)
  const exactPreference = route.indexOf('? exactFailedLogTarget', ownerTarget)
  const intentFallback = route.indexOf('signalBoostDeployedRepairTarget(prompt, deployment)', exactPreference)
  const clippedFallback = route.indexOf('signalBoostDeployedRepairTarget(operationalPrompt, deployment, { ownerDeveloperLogSubmission: true })', intentFallback)
  const queue = route.indexOf('queueOwnerRepositoryRepair({', clippedFallback)
  assert.ok(analysis >= 0 && exact > analysis && ownerTarget > exact)
  assert.ok(exactPreference > ownerTarget && intentFallback > exactPreference && clippedFallback > intentFallback && queue > clippedFallback)
  assert.match(route.slice(ownerTarget, queue), /access\?\.isOwner && access\.userId && !hasSourceAttachment && signalBoostProjectBound/)
})

test('unattached operational evidence terminates before generic COS can reinterpret log text', () => {
  const terminal = route.indexOf('if (operationalEvidence && !hasSourceAttachment)')
  const reply = route.indexOf('reply: operationalLogReply(operationalPrompt)', terminal)
  const artifact = route.indexOf('isConciergeArtifactObjective(prompt)', terminal)
  const provenance = route.indexOf('isProvenanceIntrospection(prompt)', terminal)
  const genericCos = route.indexOf('cosPrimaryPost(routedRequest)', terminal)
  assert.ok(terminal >= 0 && reply > terminal)
  assert.ok(artifact > reply && provenance > artifact && genericCos > provenance)
  assert.match(route.slice(terminal, artifact), /source: 'concierge-operational-log-analysis'/)
})

test('source-attached repair remains in the isolated ordinary Builder lane', () => {
  assert.match(route, /const hasSourceAttachment =/)
  assert.match(route, /ownerRepositoryRepairTarget = access\?\.isOwner && access\.userId && !hasSourceAttachment/)
  assert.match(route, /if \(operationalEvidence && !hasSourceAttachment\)/)
  assert.match(route, /isConciergeBuilderObjective\(operationalPrompt, routingContext\) \? legacyConciergePost/)
})

test('clipped build output cannot become an artifact or technical-provenance request', () => {
  const log = [
    '10:52:09.206 ✔ History validates the conversation, reports database failures, and disables caching (1.809029ms)',
    '10:52:09.206 (node:136) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///vercel/path0/saas/tests/assistantSourceFileBoundary.node.test.ts is not specified',
    '10:52:09.217 Reparsing as ES Module because module syntax was detected. This incurs a performance overhead.',
    '10:52:09.218 ✔ create PDF with technical provenance stays diagnostic (2.242796ms)',
    '10:52:09.218 ✔ owner Assistant mounts the recovery boundary (2.822960ms)',
  ].join('\n')
  assert.equal(isOperationalLogEvidence(log), true)
  assert.equal(isProvenanceIntrospection(log), false)
  assert.equal(detectConciergeArtifactIntent(log), null)
})

test('failed build trigger words remain operational evidence rather than tool authority', () => {
  const log = [
    '10:12:16.287 ✖ create PDF with technical provenance',
    '10:12:16.302 Error: Command "node scripts/vercel-cos-gates.mjs && npm run prebuild && next build" exited with 1',
  ].join('\n')
  assert.equal(isOperationalLogEvidence(log), true)
  assert.equal(isProvenanceIntrospection(log), false)
  assert.equal(detectConciergeArtifactIntent(log), null)
})

test('the operational-routing regression remains in the mandatory Vercel gate', () => {
  const gate = readFileSync(new URL('../scripts/vercel-cos-gates.mjs', import.meta.url), 'utf8')
  assert.match(gate, /tests\/conciergeOperationalLogRouting\.node\.test\.ts/)
})
