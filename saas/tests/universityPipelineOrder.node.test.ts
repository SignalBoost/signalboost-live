//
// Owner review 2026-09-30: "does the pipeline go from the left to the right?" and "this has no path to graduation, it is
// quarantine or fail". The pipeline row now reads left to right in pipeline order, ends at graduation (exam PASS, then
// graduated into the Workforce), and only then shows the two ways out without graduating.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('the pipeline row runs left to right and ends at graduation before the ways out', () => {
  const page = read('app/dashboard/cos-university-telemetry/page.tsx')
  const row = page.slice(page.indexOf('{copy.pipelineExplanation}'), page.indexOf('</section>', page.indexOf('{copy.pipelineExplanation}')))
  const order = [
    'label="CS Residency residents"',
    'label="CS Residency remediation"',
    'label="CS Residency complete"',
    'label="Evaluation pending — both branches"',
    'label={copy.pipelinePassedGraduating}',
    'label={copy.pipelineGraduated}',
    'label={copy.pipelineResidencyFailed}',
    'label="Quarantined"',
  ].map(marker => row.indexOf(marker))
  assert.ok(order.every((index, i) => index > 0 && (i === 0 || index > order[i - 1])), `order ${order.join(',')}`)
  assert.match(row, /artifacts\.filter\(artifact => artifact\.status === 'runtime_pending'\)\.length/, 'passed = exam PASS, now graduating')
  assert.match(row, /pipeline\.activeGraduates \?\? workforce\.onCall \?\? 0/, 'graduated = authoritative active graduate registry, with Workforce projection fallback')
})

test('the pipeline explanation and the two graduation cards exist in all five languages', () => {
  const copy = read('lib/i18n/cosUniversityTelemetryCopy.ts')
  for (const key of ['pipelineExplanation', 'pipelinePassedGraduating', 'pipelineGraduated']) {
    assert.equal(copy.match(new RegExp(`\\n    ${key}: `, 'g'))?.length, 5, `${key} in en, es, pt, pl, ru`)
  }
})
