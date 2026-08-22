import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('../lib/ai/cos/reasoningWorkerMetrics.ts', import.meta.url), 'utf8')
const migration = readFileSync(new URL('../supabase/migrations/20260821_cos_reasoning_worker_outcome_learning.sql', import.meta.url), 'utf8')

test('worker metrics persist only derived execution measurements, never prompt or answer text', () => {
  assert.match(source, /estimated_input_tokens/)
  assert.match(source, /estimated_output_tokens/)
  assert.match(source, /estimated_cost_usd/)
  assert.match(source, /latency_ms/)
  assert.doesNotMatch(source, /prompt_text\s*:/)
  assert.doesNotMatch(source, /answer_text\s*:/)
  assert.doesNotMatch(migration, /prompt_text|answer_text|raw_prompt|raw_answer/)
})

test('monetary cost requires explicit per-million pricing instead of hard-coded provider prices', () => {
  assert.match(source, /LOCAL_AI_INPUT_COST_PER_MILLION/)
  assert.match(source, /LOCAL_AI_OUTPUT_COST_PER_MILLION/)
  assert.match(source, /pricingConfigured:\s*false/)
  assert.doesNotMatch(source, /deepinfra.*\$|qwen.*\$/i)
})

test('metrics are correlated by turn id and remain service-role only', () => {
  assert.match(migration, /turn_id uuid primary key/)
  assert.match(migration, /enable row level security/)
  assert.match(migration, /revoke all on public\.cos_reasoning_worker_metrics from anon, authenticated/)
})
