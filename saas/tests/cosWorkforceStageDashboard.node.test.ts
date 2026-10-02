// saas/tests/cosWorkforceStageDashboard.node.test.ts
//
// Owner 2026-10-02: "the 16 are still there". The Graduated card counts active diplomas, which stay active while a
// graduate is employed, so it never moves. The Workforce section must show each on-call graduate's employment stage
// from cos_workforce_stage, in all five languages.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const STAGES = ['WORKFORCE_AVAILABLE', 'ASSIGNED', 'WORKING', 'AWAITING_PRODUCTION_VERIFICATION', 'PRODUCTION_VERIFIED', 'SHADOW_SERVED', 'RUNTIME_RECOVERY', 'REMEDIATION']

test('telemetry reads every on-call graduate stage from the evidence-derived view', () => {
  const route = read('app/api/admin/cos-university-telemetry/route.ts')
  assert.match(route, /db\.from\('cos_workforce_stage'\)/)
  assert.match(route, /\.eq\('workforce_status', 'on_call'\)/)
  assert.match(route, /stagesAvailable: !workforceStageResult\.error/)
  assert.match(route, /stage: workforceStageByRegistry\.get\(text\(row\.registry_id, 80\)\) \|\| null/)
})

test('the existing Workforce section shows the stages in pipeline order', () => {
  const page = read('app/dashboard/cos-university-telemetry/page.tsx')
  const order = page.slice(page.indexOf('const WORKFORCE_STAGE_ORDER'), page.indexOf('] as const', page.indexOf('const WORKFORCE_STAGE_ORDER')))
  const positions = STAGES.map(stage => order.indexOf(`'${stage}'`))
  assert.ok(positions.every((p, i) => p > 0 && (i === 0 || p > positions[i - 1])), `order ${positions.join(',')}`)
  const section = page.slice(page.indexOf('{copy.workforceTitle}'), page.indexOf('</section>', page.indexOf('{copy.workforceTitle}')))
  assert.match(section, /WORKFORCE_STAGE_ORDER\.map\(stage =>/)
  assert.match(section, /copy\.workforceStageLabels\[worker\.stage as WorkforceStage\]/)
})

test('every stage label exists in en, es, pt, pl and ru', () => {
  const copy = read('lib/i18n/cosUniversityTelemetryCopy.ts')
  assert.equal(copy.match(/\n    workforceStagesExplanation: /g)?.length, 5)
  for (const stage of STAGES) assert.equal(copy.match(new RegExp(`\\n      ${stage}: '`, 'g'))?.length, 5, stage)
})
// end of saas/tests/cosWorkforceStageDashboard.node.test.ts (if this line is missing, the paste was cut short)
