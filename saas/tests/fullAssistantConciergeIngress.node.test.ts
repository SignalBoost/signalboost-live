import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const assistantPage = readFileSync(new URL('../app/dashboard/assistant/page.tsx', import.meta.url), 'utf8')
const progressClient = readFileSync(new URL('../lib/ai/cos/agentProgressClient.ts', import.meta.url), 'utf8')
const browserRoute = readFileSync(new URL('../app/api/cos-browser/route.ts', import.meta.url), 'utf8')

test('Full Assistant live page uses observable progress and the canonical COS browser ingress', () => {
  assert.match(assistantPage, /postWithAgentProgress\(\{/)
  assert.match(assistantPage, /target: 'cos'/)
  assert.match(progressClient, /const endpoint = builderRequest\?\.endpoint \?\? '\/api\/cos-browser'/)
  assert.match(progressClient, /'x-signalboost-surface': args\.target/)
})

test('Full Assistant passive operational logs are diagnosis-only until semantic repair intent', () => {
  assert.match(browserRoute, /const ownerSoftwareAuthority = Object\.freeze\(\{ allowRepositoryRepair: true \}\)/)
  assert.match(browserRoute, /const shouldConsultSoftwareSpecialist = !operationalEvidence \|\| hasSourceAttachment \|\| explicitOperationalRepair/)
  assert.match(browserRoute, /allowRepositoryRepair: ownerSoftwareAuthority\.allowRepositoryRepair && \(!operationalEvidence \|\| explicitOperationalRepair\)/)
  assert.match(browserRoute, /if \(operationalEvidence && !hasSourceAttachment\)/)
  assert.match(browserRoute, /await diagnoseOperationalLog\(\{/)
})

test('Full Assistant carries prior operational evidence into a semantically understood repair turn', () => {
  assert.match(browserRoute, /const requestUnderstanding = await understandRequest\(\{/)
  assert.match(browserRoute, /const previousOperationalEvidence = isPastedOperationalLog\(previousUserPrompt\)/)
  assert.match(browserRoute, /const followupOperationalRepair = requestUnderstanding\?\.softwareRepairIntent === true/)
  assert.match(browserRoute, /compactOperationalLogForRepair\(previousUserPrompt\)/)
  assert.match(browserRoute, /const operationalPrompt = followupOperationalRepair/)
  assert.doesNotMatch(browserRoute, /hasExplicitOperationalLogRepairIntent/)
})

test('Full Assistant asks naturally instead of fabricating intent when action or referent is unresolved', () => {
  assert.match(browserRoute, /requestUnderstanding\?\.needsClarification/)
  assert.match(browserRoute, /clarificationQuestion\(language, requestUnderstanding\.missing\)/)
  assert.match(browserRoute, /execution_allowed: false/)
  assert.match(browserRoute, /external_action_taken: false/)
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
