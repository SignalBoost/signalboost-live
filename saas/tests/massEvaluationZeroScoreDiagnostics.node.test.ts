// saas/tests/massEvaluationZeroScoreDiagnostics.node.test.ts
// Two Production defects from 2026-09-19 are pinned here.
//
// 1. The twelve fixed cases share one endpoint request per model capped at 1024 output tokens, so each
//    answer has roughly 85 tokens. Cases whose expected answers exceed that produce responses the later
//    suites cannot fit.
// 2. Retention scored 0.000 for BOTH models on every case across four consecutive runs, and nothing in
//    the database could explain it: only a sha256 of the judge response was retained. A suite that is
//    wholly zero for both models is a defect signal, not a grade, and must keep evidence.
import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

const SOURCE = readFileSync(
  new URL('../lib/ai/cos/cosUniversityMassDistilledArtifactEvaluation.ts', import.meta.url),
  'utf8',
)

function fixedCases() {
  const seg = SOURCE.slice(SOURCE.indexOf('function safetyCases'), SOURCE.indexOf('async function massRun'))
  return [...seg.matchAll(/\{id:'([a-z-]+)',prompt:'(.*?)',reference:'(.*?)'\}/g)]
    .map(m => ({ id: m[1], prompt: m[2], reference: m[3] }))
}

const ESTIMATED_CHARS_PER_TOKEN = 3
const OUTPUT_CAP_TOKENS = 1024

test('the fixed suites are exactly twelve unique cases, four per suite', () => {
  const cases = fixedCases()
  assert.equal(cases.length, 12)
  assert.equal(new Set(cases.map(c => c.id)).size, 12)
  for (const prefix of ['safety-', 'transfer-', 'retention-']) {
    assert.equal(cases.filter(c => c.id.startsWith(prefix)).length, 4, prefix)
  }
})

test('every expected answer fits the per-case output budget', () => {
  const cases = fixedCases()
  const perCase = Math.floor(OUTPUT_CAP_TOKENS / cases.length)
  for (const c of cases) {
    const tokens = Math.ceil(c.reference.length / ESTIMATED_CHARS_PER_TOKEN)
    assert.ok(tokens <= perCase, `${c.id} reference ~${tokens} tokens exceeds ${perCase}`)
  }
})

test('the combined prompt leaves room for the full output allowance', () => {
  const cases = fixedCases()
  const promptChars = cases.reduce((n, c) => n + c.prompt.length, 0)
  const estimated = Math.ceil((103 + promptChars + cases.length * 60) / ESTIMATED_CHARS_PER_TOKEN) + 128
  assert.ok(estimated + OUTPUT_CAP_TOKENS < 8192, `prompt ~${estimated} tokens leaves no output room`)
})

test('the discriminating quantities survived the rewrite', () => {
  const byId = Object.fromEntries(fixedCases().map(c => [c.id, c.reference]))
  assert.match(byId['transfer-base-rate-quantified'], /16%/)
  assert.match(byId['retention-ev-asymmetric'], /\$7/)
  assert.match(byId['retention-update-direction'], /44%/)
})

test('the judge returns a bounded excerpt alongside its hash', () => {
  assert.match(SOURCE, /rawExcerpt:clean\(result,1200\)/)
  assert.match(SOURCE, /judgeExcerpt:string\|null/)
})

test('an excerpt is kept only when both models score zero on every case of a suite', () => {
  assert.match(SOURCE, /judgeExcerpt:judged\.scored\.every\(item=>item\.baseline===0&&item\.candidate===0\)\?judged\.rawExcerpt:null/)
})

test('excerpts are persisted for all four suites through the existing jsonb column', () => {
  assert.match(SOURCE, /zeroScoreJudgeExcerpts:Object\.fromEntries/)
  for (const suite of ['holdout', 'safety', 'transfer', 'retention']) {
    assert.ok(SOURCE.includes(`['${suite}',${suite}]`), suite)
  }
  // No schema change: the excerpts ride in response_hashes, which is already jsonb.
  assert.match(SOURCE, /response_hashes:\{holdout:holdout\.responseHashes/)
})

test('scoring thresholds and the call ceiling were not touched', () => {
  assert.match(SOURCE, /safety\.candidateScore>=0\.75/)
  assert.match(SOURCE, /transfer\.candidateScore>=0\.72/)
  assert.match(SOURCE, /retention\.candidateScore>=0\.72/)
  assert.match(SOURCE, /const ENDPOINT_CALLS = MASS_EVALUATION_ENDPOINT_CALLS/)
})

test('each fixed suite gets its own request per model, so output budget is not shared across twelve cases', () => {
  // Production 2026-09-19: one combined request decayed by position - safety 1.000, transfer 0.625,
  // retention 0.000 - because twelve answers shared a 1024-token cap.
  for (const suite of ['safety', 'transfer', 'retention']) {
    for (const role of ['baseline', 'candidate']) {
      assert.match(SOURCE, new RegExp(`feature:'mass_distilled_eval_${suite}_${role}'`), `${suite}/${role}`)
    }
    assert.match(SOURCE, new RegExp(`baseline:${suite}Baseline,candidate:${suite}Candidate`), suite)
  }
  assert.match(SOURCE, /const fixedEndpointCalls=6;const recoveryReserve=1/)
  assert.doesNotMatch(SOURCE, /mass_distilled_eval_fixed_suites_(baseline|candidate)/)
  assert.doesNotMatch(SOURCE, /const fixedCases=/)
})
