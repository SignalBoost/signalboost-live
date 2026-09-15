import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')

test('distilled evaluation is bounded and requires exact holdout, canary and authorization', () => {
  const evaluator = source('../lib/ai/cos/cosUniversityDistilledArtifactEvaluation.ts')
  assert.match(evaluator, /MAX_ENDPOINT_CALLS = 8/)
  assert.match(evaluator, /MAX_JUDGE_CALLS = 4/)
  assert.match(evaluator, /evaluation_approval_missing_or_expired/)
  assert.match(evaluator, /exact_runtime_canary_not_proven/)
  assert.match(evaluator, /holdout_revision_moved/)
  assert.match(evaluator, /holdout_manifest_mismatch/)
  assert.match(evaluator, /sha256Raw\(text\) !== itemHash/)
  assert.match(evaluator, /MIN_DISTILLED_RETENTION_DELAY_MS = 12 \* 60 \* 60 \* 1000/)
})

test('RunPod batches request concise final answers without a long hidden-reasoning generation', () => {
  const evaluator = source('../lib/ai/cos/cosUniversityDistilledArtifactEvaluation.ts')
  assert.match(evaluator, /COS_DISTILLED_EVALUATOR_VERSION = 'cos-distilled-exact-artifact-evaluator-v2'/)
  assert.match(evaluator, /MAX_BATCH_CASES = 4/)
  assert.match(evaluator, /MIN_BATCH_COMPLETION_TOKENS = 384/)
  assert.match(evaluator, /MAX_BATCH_COMPLETION_TOKENS = 640/)
  assert.match(evaluator, /BATCH_COMPLETION_TOKENS_PER_CASE = 128/)
  assert.match(evaluator, /at most 60 words per answer/)
  assert.match(evaluator, /chat_template_kwargs: \{ enable_thinking: false \}/)
  assert.match(evaluator, /Math\.min\(\s*MAX_BATCH_COMPLETION_TOKENS,/)
  assert.match(evaluator, /if \(!input\.cases\.length \|\| input\.cases\.length > MAX_BATCH_CASES\)/)
  assert.match(evaluator, /if \(expectedHashes\.length > MAX_BATCH_CASES\) throw new Error\('distilled_evaluation_holdout_batch_size_unsupported'\)/)
  assert.doesNotMatch(evaluator, /Math\.min\(4096, Math\.max\(1024, input\.cases\.length \* 420\)\)/)
})

test('student never grades itself and teacher cannot be the independent evaluator', () => {
  const evaluator = source('../lib/ai/cos/cosUniversityDistilledArtifactEvaluation.ts')
  const inference = source('../lib/ai/local-inference.ts')
  assert.match(evaluator, /purpose: 'independent_assessment'/)
  assert.match(evaluator, /independentEvaluatorConfigFromEnv\(\)/)
  assert.match(evaluator, /signIndependentEvaluatorPayload/)
  assert.match(evaluator, /evaluatorIds\.has\(clean\(artifact\.teacher_model_id/)
  assert.match(evaluator, /DISTILLED_BASE_MODEL_ID/)
  assert.match(evaluator, /DISTILLED_MODEL_NAME/)
  assert.match(inference, /purpose\.includes\('independent_assessment'\)/)
  assert.match(inference, /protectedIndependentEvaluation/)
})

test('evaluation stores hashes and scores, never raw prompt or response columns', () => {
  const migration = source('../supabase/migrations/20260914122500_cos_distilled_evaluation_runs.sql')
  assert.match(migration, /cos_university_distilled_evaluation_runs/)
  assert.match(migration, /response_hashes jsonb/)
  assert.doesNotMatch(migration, /prompt text|response text|reference text|chain_of_thought|hidden_reasoning text/)
  assert.match(migration, /enable row level security/)
  assert.match(migration, /revoke all on table public\.cos_university_distilled_evaluation_runs from public, anon, authenticated/)
})

test('independent evaluator cannot dispatch new training', () => {
  const evaluator = source('../lib/ai/cos/cosUniversityDistilledArtifactEvaluation.ts')
  const route = source('../app/api/cron/cos-university-distilled-evaluation/route.ts')
  assert.doesNotMatch(evaluator, /submitHuggingFaceJob|dispatchUniversityApprovedTraining|generate_teacher_dataset|operation:\s*['"]train['"]/)
  assert.match(route, /CRON_SECRET/)
  assert.match(route, /runUniversityDistilledArtifactEvaluation/)
})

test('evaluator-only signing key falls back to service-only Vault without sharing learner credentials', () => {
  const evaluatorAuth = source('../lib/ai/cos/cosUniversityIndependentEvaluator.ts')
  const route = source('../app/api/cron/cos-university-distilled-evaluation/route.ts')
  const migration = source('../supabase/migrations/20260914130000_cos_independent_evaluator_vault_secret.sql')
  assert.match(evaluatorAuth, /independentEvaluatorConfigFromEnv\(\)/)
  assert.match(evaluatorAuth, /cos_read_independent_evaluator_secret/)
  assert.match(route, /withinRouteDeadline\(independentEvaluatorConfig\(\), routeDeadlineMs\)/)
  assert.match(route, /process\.env\.COS_UNIVERSITY_INDEPENDENT_EVALUATOR_SECRET = evaluator\.secret/)
  assert.match(migration, /vault\.create_secret/)
  assert.match(migration, /gen_random_bytes\(48\)/)
  assert.match(migration, /security definer/)
  assert.match(migration, /revoke all on function public\.cos_read_independent_evaluator_secret\(\) from public, anon, authenticated/)
  assert.match(migration, /grant execute on function public\.cos_read_independent_evaluator_secret\(\) to service_role/)
  assert.doesNotMatch(migration, /RUNPOD_API_KEY|LOCAL_AI_API_KEY|TRAINING_EXECUTOR_SECRET/)
})

test('fresh canary authorization owns a fresh retry budget and produces promotion evidence', () => {
  const route = source('../app/api/cron/runpod-distilled-local-deploy/route.ts')
  assert.match(route, /approvalObservedAt/)
  assert.match(route, /Date\.parse\(String\(row\?\.observed_at/)
  assert.match(route, /authorizationObservedAt: approvalObservedAt/)
  assert.match(route, /recordProductionCanaryEvidence/)
  assert.match(route, /claim: 'production_canary_healthy'/)
  assert.match(route, /verifier: 'host_production_verifier'/)
  assert.match(route, /productionTrafficAuthorized: false/)
})

test('Vercel schedules evaluation independently and spaces canaries beyond their cold-start envelope', () => {
  const config = JSON.parse(source('../vercel.json'))
  assert.equal(config.crons.find((cron: { path: string }) => cron.path === '/api/cron/cos-university-distilled-evaluation')?.schedule, '*/10 * * * *')
  assert.equal(config.crons.find((cron: { path: string }) => cron.path === '/api/cron/runpod-distilled-local-deploy')?.schedule, '*/5 * * * *')
})

test('evaluation accepts only canonical verifier-bound production canary evidence', () => {
  const evaluator = source('../lib/ai/cos/cosUniversityDistilledArtifactEvaluation.ts')
  assert.match(evaluator, /FINE_TUNE_EVIDENCE_PROFILE/)
  assert.match(evaluator, /row\.verifier === 'host_production_verifier'/)
  assert.match(evaluator, /evidence\?\.claim === 'production_canary_healthy'/)
  assert.match(evaluator, /evidence\?\.trainedArtifactId/)
  assert.match(evaluator, /evidence\?\.revisionKey/)
  assert.match(evaluator, /evidence\?\.exactArtifact === true/)
  assert.match(evaluator, /evidence\?\.authorityExpanded === false/)
  assert.match(evaluator, /observedAt <= now\.getTime\(\)/)
  assert.match(evaluator, /expiresAt > now\.getTime\(\)/)
  assert.doesNotMatch(evaluator, /cos_local_distilled_runtime_deploy_v1/)
  assert.doesNotMatch(evaluator, /local_distilled_runtime_canary_passed/)
})
