import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

test('browser fast edits terminate before auth and never descend into COS Primary', () => {
  const browser = readFileSync(join(process.cwd(), 'app/api/cos-browser/route.ts'), 'utf8')
  const fast = readFileSync(join(process.cwd(), 'app/api/cos-fast-transform/route.ts'), 'utf8')
  const direct = readFileSync(join(process.cwd(), 'lib/ai/cos/fastTextEditDirect.ts'), 'utf8')

  const fastBranch = browser.indexOf('if (isFastTextTransform(prompt))')
  const auth = browser.indexOf('const access = await getAccess()')
  assert.ok(fastBranch >= 0 && auth > fastBranch, 'fast edit must run before auth')

  assert.match(browser, /runDirectFastTextEdit\(prompt\)/)
  assert.match(fast, /runDirectFastTextEdit\(prompt\)/)
  assert.doesNotMatch(fast, /cosPrimaryPost/)
  assert.doesNotMatch(fast, /callRawCosReasoner|callCosReasoner/)

  assert.match(direct, /new AbortController\(\)/)
  assert.match(direct, /signal: controller\.signal/)
  assert.match(direct, /setTimeout\(\(\) => controller\.abort\(\), deadlineMs\(\)\)/)
  assert.match(direct, /DEFAULT_DEADLINE_MS = 18_000/)\n  assert.match(direct, /DEFAULT_ATTEMPT_MS = 6_000/)\n  assert.match(direct, /COS_FAST_TEXT_MODEL/)\n  assert.match(direct, /deepseek-ai\\/DeepSeek-V4-Flash/)\n  assert.match(direct, /for \(const model of modelCandidates\(baseUrl, configuredModel\)\)/)
  assert.match(direct, /LOCAL_AI_MODEL/)\n  assert.match(direct, /Math\.min\(attemptMs\(\), remainingMs\)/)
})

test('middleware still sends fast transforms to the protected fast route', () => {
  const proxy = readFileSync(join(process.cwd(), 'proxy.ts'), 'utf8')
  const fast = readFileSync(join(process.cwd(), 'app/api/cos-fast-transform/route.ts'), 'utf8')
  assert.match(proxy, /fastTextTransformRequest\(req\)/)
  assert.match(proxy, /target\.pathname = '\/api\/cos-fast-transform'/)
  assert.match(fast, /x-signalboost-fast-transform-internal/)
  assert.match(fast, /fast_transform_ingress_required/)
})

test('the live CAP edit request matches the server fast-transform detector', () => {
  const proxy = readFileSync(join(process.cwd(), 'proxy.ts'), 'utf8')
  assert.match(proxy, /edit\|rewrite\|rephrase\|proofread\|polish/)
})
