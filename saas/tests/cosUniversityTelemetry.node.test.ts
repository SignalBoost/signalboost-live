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
  assert.match(page, /const REFRESH_MS = 60_000/)
  assert.match(page, /MAX_REFRESH_MS = 300_000/)
  assert.match(page, /window\.setTimeout/)
  assert.match(page, /inFlight\.current/)
  assert.match(page, /consecutiveFailures\.current/)
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


test('University telemetry hot-path migration matches the Production sort/filter patterns', () => {
  const migration = source('supabase/migrations/20260920064000_university_telemetry_backpressure_indexes.sql')
  assert.match(migration, /cos_mass_runs_updated_desc_idx/)
  assert.match(migration, /cos_university_mass_distillation_batch_runs \(updated_at desc\)/)
  assert.match(migration, /cos_mass_campaigns_updated_desc_idx/)
  assert.match(migration, /cos_university_mass_distillation_campaigns \(updated_at desc\)/)
  assert.match(migration, /cos_mass_teacher_rows_created_desc_idx/)
  assert.match(migration, /cos_university_mass_hosted_teacher_rows \(created_at desc\)/)
  assert.match(migration, /cos_mass_provider_jobs_dispatched_desc_idx/)
  assert.match(migration, /cos_university_mass_distillation_provider_jobs \(dispatched_at desc\)/)
  assert.match(migration, /cos_mass_provider_jobs_run_updated_desc_idx/)
  assert.match(migration, /cos_university_mass_distillation_provider_jobs \(run_id, updated_at desc\)/)
})


test('University telemetry exposes read-only evaluator claim blockers without changing authority', () => {
  const route = source('app/api/admin/cos-university-telemetry/route.ts')
  assert.match(route, /claimability = 'waiting_12h'/)
  assert.match(route, /claimability = 'missing_approval'/)
  assert.match(route, /claimability = 'approval_expired'/)
  assert.match(route, /claimability = 'missing_exact_canary'/)
  assert.match(route, /claimability = 'active_reservation'/)
  assert.match(route, /claimability = 'evaluator_failed'/)
  assert.match(route, /claimability = 'claimable'/)
  assert.doesNotMatch(route, /export async function POST/)
})
