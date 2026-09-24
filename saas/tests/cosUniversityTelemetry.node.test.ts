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


test('University telemetry exposes a separate open-source acquisition lane with truthful observed counts', () => {
  const route = source('app/api/admin/cos-university-telemetry/route.ts')
  const page = source('app/dashboard/cos-university-telemetry/page.tsx')
  const copy = source('lib/i18n/cosUniversityTelemetryCopy.ts')
  const semanticResearch = source('lib/cos-core/layers/learning/semanticResearch.ts')

  assert.match(route, /OPEN_SOURCE_CATALOG/)
  assert.match(route, /openalex_gte_large_en_v1/)
  assert.match(route, /semantic_scholar_specter2_proximity_v2/)
  assert.match(route, /Hugging Face open datasets[\s\S]*integration: 'implemented'/)
  assert.match(route, /allowlisted_cc0_corpora_source_vectors_plus_internal_reembedding/)
  assert.match(route, /Wikipedia \/ Wikimedia[\s\S]*integration: 'implemented'/)
  assert.match(route, /huggingface_dataset:/)
  assert.match(route, /hf:\/\/datasets\//)
  assert.match(route, /items24h/)
  assert.match(route, /embedded24h/)
  assert.match(route, /status: source\.items24h > 0 \? 'observed' : source\.integration/)
  assert.match(route, /sourceAccessCostUsd24h:\s*0/)
  assert.match(page, /copy\.openSourcesTitle/)
  assert.match(page, /copy\.openSourceStates/)
  assert.match(page, /summary\.openSourceItems24h/)
  assert.match(copy, /Shared acquisition for Working COS and University/)
  assert.match(semanticResearch, /openalex_gte_large_en_v1/)
  assert.match(semanticResearch, /semantic_scholar_specter2_proximity_v2/)
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
  assert.ok(route.indexOf("else if (!canary) claimability = 'missing_exact_canary'") < route.indexOf("else if (!approval) claimability = 'missing_approval'"), 'exact canary must be reported before the approval it gates')
  assert.doesNotMatch(route, /export async function POST/)
})


test('University telemetry exposes read-only Working COS balanced bundle readiness', () => {
  const route = source('app/api/admin/cos-university-telemetry/route.ts')
  const page = source('app/dashboard/cos-university-telemetry/page.tsx')
  const copy = source('lib/i18n/cosUniversityTelemetryCopy.ts')

  assert.match(route, /selectWorkingCosBalancedBundleFromVault/)
  assert.match(route, /workingCos:\s*\{/)
  assert.match(route, /automaticTrainingAuthorized:\s*false/)
  assert.match(route, /productionTrafficAuthorized:\s*false/)
  assert.match(route, /queryWorkingCosRuntimeIdentity/)
  assert.match(route, /workingCosRuntimeBindingFromEnv/)
  assert.match(route, /workingCosRuntimeBinding\?\.eligible/)
  assert.match(route, /workingCosRuntimeBinding\.nextGate/)
  assert.match(route, /'runtime_binding'/)
  assert.match(page, /copy\.workingCosTitle/)
  assert.match(page, /workingCos\.subjectCount/)
  assert.match(page, /workingCos\.itemCount/)
  assert.match(page, /workingCos\.subjectIds/)
  assert.match(copy, /Working COS · direct distillation readiness/)
})


test('University telemetry 24-hour summaries are not derived from capped display rows', () => {
  const route = source('app/api/admin/cos-university-telemetry/route.ts')
  assert.match(route, /select\('id', \{ count: 'exact', head: true \}\)/)
  assert.match(route, /const totalRuns24h = n\(totalRunCountResult\.count\)/)
  assert.match(route, /const inFlightRuns24h = Math\.max\(0, totalRuns24h - completedRuns24h - failedRuns24h\)/)
  assert.match(route, /collectPages<any>/)
  assert.match(route, /\.range\(from, to\)/)
  assert.doesNotMatch(route, /completedRuns24h:\s*buckets\./)
})

test('University telemetry wraps and humanizes long Working COS gate labels', () => {
  const page = source('app/dashboard/cos-university-telemetry/page.tsx')
  assert.match(page, /function gateLabel/)
  assert.match(page, /replaceAll\('_', ' '\)/)
  assert.match(page, /overflowWrap:\s*'anywhere'/)
})
