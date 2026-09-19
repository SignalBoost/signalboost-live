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
  const copy = source('lib/i18n/cosUniversityTelemetryCopy.ts')
  assert.match(page, /\/api\/admin\/cos-university-telemetry/)
  assert.match(page, /window\.setInterval/)
  assert.match(page, /providerMix/)
  assert.match(page, /copy\.hfObservedCost24h/)
  assert.match(page, /copy\.providersTitle/)
  assert.match(page, /copy\.preparation/)
  assert.match(page, /copy\.training/)
  assert.match(page, /COS_UNIVERSITY_TELEMETRY_COPY/)
  assert.match(copy, /HF observed cost/)
  assert.match(copy, /read-only/i)
  for (const lang of ['en', 'es', 'pt', 'pl', 'ru']) assert.match(copy, new RegExp('\\b' + lang + ': \\{'))
})


test('University telemetry seeds active hosted teachers before live rows so new providers are visible at zero', () => {
  const route = source('app/api/admin/cos-university-telemetry/route.ts')
  const page = source('app/dashboard/cos-university-telemetry/page.tsx')
  assert.match(route, /universityTeacherPoolStatus\(process\.env\)/)
  assert.match(route, /teacher\.transport === 'huggingface_job'/)
  assert.match(route, /teacher\.massDistillationEligible !== true/)
  assert.match(route, /calls:\s*0/)
  assert.match(route, /teacher\.endsWith\('-api'\)/)
  assert.match(page, /'gemini'/)
  assert.match(page, /'deepseek'/)
})
