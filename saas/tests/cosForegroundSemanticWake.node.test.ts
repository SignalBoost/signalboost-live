import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

function source(path: string): string {
  return readFileSync(new URL(path, import.meta.url), 'utf8')
}

test('COS Primary scopes requests with validated RunPod wake permission', () => {
  const route = source('../app/api/cos-primary/route.ts')
  assert.ok(route.includes('evaluateRunpodWakePermission'))
  assert.ok(route.includes("interactionHeader: req.headers.get('x-signalboost-user-interaction')"))
  assert.ok(route.includes("requestOrigin: req.headers.get('origin')"))
  assert.ok(route.includes('expectedOrigin: req.nextUrl.origin'))
  assert.ok(route.includes("secFetchSite: req.headers.get('sec-fetch-site')"))
  assert.ok(route.includes('withRunpodWakePermission(wakePermission'))
  assert.ok(route.includes("from './routeCore.ts'"))

  const core = source('../app/api/cos-primary/routeCore.ts')
  assert.ok(core.includes("from './baseRoute.ts'"), 'current COS Primary core must preserve the non-fresh base route')
  assert.ok(core.includes('handleFreshSinglePass'), 'current fresh-fact single-pass route must remain intact')
})

test('ordinary COS preflights runtime before bounded enterprise semantic retrieval', () => {
  const text = source('../lib/ai/cos/cosFirstAnswer.ts')
  const exported = text.slice(text.indexOf('export async function tryCOSFirstAnswer'))
  const fresh = exported.indexOf('requiresFreshExternalEvidence(input.prompt)')
  const preflight = exported.indexOf('await ensureLocalInferenceRuntimeReady()')
  const enterprise = exported.lastIndexOf('return tryEnterpriseCOSFirstAnswer(input)')

  assert.ok(fresh >= 0, 'fresh/current-fact routing must remain present')
  assert.ok(preflight > fresh, 'ordinary runtime preflight must not precede fresh/current-fact routing')
  assert.ok(enterprise > preflight, 'runtime readiness must finish before enterprise retrieval starts')
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
