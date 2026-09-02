import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { detectConciergeArtifactIntent } from '../lib/artifacts/intent.ts'
import { isOperationalLogEvidence } from '../lib/ai/cos/pastedOperationalLog.ts'
import { isProvenanceIntrospection } from '../lib/ai/cos/provenanceIntrospection.ts'

const route = readFileSync(new URL('../app/api/cos-browser/route.ts', import.meta.url), 'utf8')

test('browser ingress sends passive pasted build logs to COS without granting ordinary Builder authority', () => {
  assert.doesNotMatch(route, /if \(pastedOperationalLog && !hasSourceAttachment\)/)
  assert.match(route, /Passive logs carry evidence but no execution authority for public\/member traffic/)
  assert.match(route, /isConciergeBuilderObjective\(operationalPrompt, routingContext\) \? legacyConciergePost\(routedRequest\) : cosPrimaryPost\(routedRequest\)/)
})

test('standalone immediately preceding debug intent carries into the next pasted log turn', () => {
  assert.match(route, /const previousUser = userMessages\.at\(-2\)/)
  assert.match(route, /const previousUserPrompt = typeof previousUser\?\.content === 'string' \? previousUser\.content : ''/)
  assert.match(route, /isExplicitOperationalLogRepairRequest\(operationalPrompt\)[\s\S]{0,180}pastedOperationalLog && hasExplicitOperationalLogRepairIntent\(previousUserPrompt\)/)
})

test('Full Assistant browser requests enter the canonical browser ingress before A2A routing', () => {
  const proxy = readFileSync(new URL('../proxy.ts', import.meta.url), 'utf8')
  const fullAssistant = proxy.indexOf("pathname === '/api/cos-primary' && req.method === 'POST' && isFullAssistantBrowserRequest(req)")
  const browserRewrite = proxy.indexOf("cosBrowserUrl.pathname = '/api/cos-browser'", fullAssistant)
  const specialist = proxy.indexOf("specialistUrl.pathname = '/api/cos-specialist'", browserRewrite)
  assert.ok(fullAssistant >= 0 && browserRewrite > fullAssistant && specialist > browserRewrite)
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

test('authenticated owner platform repair is intent-driven and does not require a pasted log or source file', () => {
  const explicit = route.match(/const explicitOwnerPlatformTarget =[\s\S]*?if \(explicitOwnerPlatformTarget && access\?\.userId\) \{[\s\S]*?\n  }/)
  assert.ok(explicit)
  const text = explicit?.[0] || ''
  assert.match(text, /access\?\.isOwner && access\.userId && !hasSourceAttachment && signalBoostProjectBound/)
  assert.match(text, /signalBoostDeployedRepairTarget\(prompt, deployment\)/)
  assert.match(text, /queueOwnerRepositoryRepair/)
  assert.doesNotMatch(text, /operationalEvidence/)
  assert.doesNotMatch(text, /parseSignalBoostRepositoryRepairTarget/)
})

test('failed owner logs prefer an exact target but can use verified SignalBoost deployment binding when clipped', () => {
  assert.match(route, /const signalBoostProjectBound = SIGNALBOOST_OPERATIONAL_TARGET\.test\(operationalPrompt\) \|\| isSignalBoostDeploymentContext\(req\)/)
  assert.match(route, /const ownerSignalBoostLogTarget =[\s\S]*operationalEvidence && operationalLogAnalysis\.failed[\s\S]*signalBoostProjectBound/)
  assert.match(route, /exactFailedLogTarget \?\? signalBoostDeployedRepairTarget\(operationalPrompt, deployment, \{ ownerDeveloperLogSubmission: true \}\)/)
  assert.match(route, /if \(ownerSignalBoostLogTarget && access\?\.userId\)[\s\S]*queueOwnerRepositoryRepair/)
  assert.match(route, /VERCEL_GIT_REPO_OWNER/)
  assert.match(route, /VERCEL_GIT_REPO_SLUG/)
})

test('source-attached repair stays in the isolated workspace lane rather than gaining repository authority', () => {
  assert.match(route, /const hasSourceAttachment =/)
  assert.match(route, /explicitOwnerPlatformTarget = access\?\.isOwner && access\.userId && !hasSourceAttachment/)
  assert.match(route, /ownerSignalBoostLogTarget = access\?\.isOwner && access\.userId && !hasSourceAttachment/)
  assert.match(route, /isConciergeBuilderObjective\(operationalPrompt, routingContext\) \? legacyConciergePost/)
})

test('attached text logs join the request before diagnosis without becoming visual or artifact work', () => {
  assert.match(route, /readAttachedOperationalEvidence\(body\?\.attachments\)/)
  assert.match(route, /const operationalPrompt = attachedOperationalEvidence/)
  assert.match(route, /messages: messages\.map\([\s\S]{0,180}content: operationalPrompt/)
  assert.match(route, /if \(!operationalEvidence\) \{[\s\S]*isConciergeArtifactObjective\(prompt\)[\s\S]*isConciergeVisualObjective\(prompt\)/)
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

test('artifact and provenance trigger words inside a failed build remain operational evidence', () => {
  const log = [
    '10:12:16.287 ✖ create PDF with technical provenance',
    '10:12:16.302 Error: Command "node scripts/vercel-cos-gates.mjs && npm run prebuild && next build" exited with 1',
  ].join('\n')
  assert.equal(isOperationalLogEvidence(log), true)
  assert.equal(isProvenanceIntrospection(log), false)
  assert.equal(detectConciergeArtifactIntent(log), null)

  const artifactRoute = readFileSync(new URL('../app/api/artifacts/route.ts', import.meta.url), 'utf8')
  const backendGuard = artifactRoute.indexOf('if (isOperationalLogEvidence(rawObjective))')
  const objectiveValidation = artifactRoute.indexOf('const objective = objectiveOf(rawObjective)', backendGuard)
  const generation = artifactRoute.indexOf('createPlatformAiPort().generate', objectiveValidation)
  assert.ok(backendGuard >= 0 && objectiveValidation > backendGuard && generation > objectiveValidation)
})

test('the routing regression remains in the mandatory Vercel gate', () => {
  const gate = readFileSync(new URL('../scripts/vercel-cos-gates.mjs', import.meta.url), 'utf8')
  assert.match(gate, /tests\/conciergeOperationalLogRouting\.node\.test\.ts/)
})

test('legacy Concierge sends passive logs to COS instead of returning an obsolete canned reply', () => {
  const legacy = readFileSync(new URL('../app/api/concierge/route.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(legacy, /isPastedOperationalLog\(objective\)/)
  assert.doesNotMatch(legacy, /source: 'concierge-operational-log-analysis'/)
  assert.match(legacy, /const primaryRun = await boundedPrimary\(req\)/)
})
