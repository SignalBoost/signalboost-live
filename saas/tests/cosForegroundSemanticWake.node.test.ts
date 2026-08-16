import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

function source(path: string): string {
  return readFileSync(new URL(path, import.meta.url), 'utf8')
}

test('browser COS ingress owns validated request-scoped RunPod wake permission', () => {
  const browser = source('../app/api/cos-browser/route.ts')
  assert.ok(browser.includes('evaluateRunpodWakePermission'))
  assert.ok(browser.includes("interactionHeader: req.headers.get('x-signalboost-user-interaction')"))
  assert.ok(browser.includes("requestOrigin: req.headers.get('origin')"))
  assert.ok(browser.includes('expectedOrigin: req.nextUrl.origin'))
  assert.ok(browser.includes("secFetchSite: req.headers.get('sec-fetch-site')"))
  assert.ok(browser.includes('withRunpodWakePermission(permission'))
  assert.ok(browser.includes('cosPrimaryPost(req)'))

  const primary = source('../app/api/cos-primary/route.ts')
  assert.ok(primary.includes('requiresFreshExternalEvidence'))
  assert.ok(primary.includes('handleFreshSinglePass'))
  assert.ok(primary.includes('synthesizeFreshEvidenceExternally'))
  assert.equal(primary.includes('ensureLocalInferenceRuntimeReady'), false, 'fresh-data ingress must not preflight or wake RunPod')
})

test('ordinary COS preflights runtime before bounded enterprise semantic retrieval', () => {
  const text = source('../lib/ai/cos/cosFirstAnswer.ts')
  const exported = text.slice(text.indexOf('export async function tryCOSFirstAnswer'))
  const fresh = exported.indexOf('requiresFreshExternalEvidence(input.prompt)')
  const preflight = exported.indexOf('await ensureLocalInferenceRuntimeReady()')
  const noRetryScope = exported.indexOf('return withRunpodWakePermission({')
  const noRetryReason = exported.indexOf("reason: 'runtime_preflight_failed_no_retry'")
  const enterprise = exported.lastIndexOf('return tryEnterpriseCOSFirstAnswer(input)')

  assert.ok(fresh >= 0, 'fresh/current-fact routing must remain present')
  assert.ok(preflight > fresh, 'ordinary runtime preflight must not precede fresh/current-fact routing')
  assert.ok(noRetryScope > preflight, 'failed preflight must enter an explicit no-wake scope before lexical/enterprise fallback')
  assert.ok(noRetryReason > noRetryScope, 'no-wake fallback must carry an explicit failed-preflight reason')
  assert.ok(exported.includes("source: 'background_or_untrusted'"), 'failed-preflight fallback must not retain interactive wake authority')
  assert.ok(exported.includes('() => tryEnterpriseCOSFirstAnswer(input)'), 'lexical/internal enterprise fallback must remain available after wake suppression')
  assert.ok(enterprise > preflight, 'normal runtime readiness must finish before enterprise retrieval starts')
})

test('foreground embedding kill switch fails before config, readiness, or fetch', () => {
  const text = source('../lib/ai/cos/localEmbeddings.ts')
  const readyStart = text.indexOf('export async function generateReadyLocalEmbeddings')
  const readyEnd = text.indexOf('/** Canonical foreground embedding API', readyStart)
  const ready = text.slice(readyStart, readyEnd)

  const killSwitch = ready.indexOf("process.env.COS_LOCAL_FIRST_ENABLED === 'false'")
  const config = ready.indexOf('localInferenceConfigFromEnv()')
  const readiness = ready.indexOf('ensureLocalInferenceRuntimeReady(config)')

  assert.ok(killSwitch >= 0, 'foreground embedding must honor COS_LOCAL_FIRST_ENABLED')
  assert.ok(config > killSwitch, 'kill switch must run before local runtime configuration')
  assert.ok(readiness > config, 'runtime readiness must follow the kill switch')
})

test('background embedding paths remain passive and lifecycle-neutral', () => {
  const embeddings = source('../lib/ai/cos/localEmbeddings.ts')
  const passiveStart = embeddings.indexOf('export const generatePassiveLocalEmbedding')
  const passiveEnd = embeddings.indexOf('/** Backward-compatible explicit name', passiveStart)
  const passive = embeddings.slice(passiveStart, passiveEnd)
  assert.ok(passive.includes('generateLocalEmbeddings([text])'))
  assert.equal(passive.includes('ensureLocalInferenceRuntimeReady'), false)

  const facts = source('../lib/ai/cos/knowledgeFactSemantic.ts')
  assert.ok(facts.includes('generatePassiveLocalEmbedding'))
  assert.equal(facts.includes('generateLocalEmbedding('), false)

  const corpus = source('../lib/ai/cos/learnedCorpusSemantic.ts')
  assert.ok(corpus.includes('generatePassiveLocalEmbedding'))
  assert.equal(corpus.includes('generateLocalEmbedding('), false)
})
