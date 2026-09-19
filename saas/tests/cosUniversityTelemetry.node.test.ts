// saas/tests/cosUniversityTelemetry.node.test.ts
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

function source(path: string): string {
  return readFileSync(new URL('../' + path, import.meta.url), 'utf8')
}

test('University telemetry is owner-only, read-only and never exposes teacher response text', () => {
  const route = source('app/api/admin/cos-university-telemetry/route.ts')
  assert.match(route, /await requireOwner\(\)/)
  assert.match(route, /export async function GET\(\)/)
  assert.doesNotMatch(route, /export async function POST/)
  assert.doesNotMatch(route, /response_text/)
  assert.match(route, /readOnly:\s*true/)
  assert.match(route, /cos_university_mass_hosted_teacher_rows/)
  assert.match(route, /cos_university_mass_distillation_provider_jobs/)
})

test('University telemetry dashboard watches multi-provider calls and the HF pipeline', () => {
  const page = source('app/dashboard/cos-university-telemetry/page.tsx')
  assert.match(page, /\/api\/admin\/cos-university-telemetry/)
  assert.match(page, /window\.setInterval/)
  assert.match(page, /providerMix/)
  assert.match(page, /HF observed cost/)
  assert.match(page, /Frontier teacher providers/)
  assert.match(page, /Preparation/)
  assert.match(page, /Training/)
  assert.match(page, /read-only/i)
})
