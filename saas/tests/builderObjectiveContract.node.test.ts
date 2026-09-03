import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  BuilderObjectiveError,
  MAX_BUILDER_OBJECTIVE_CHARS,
  MAX_BUILDER_RAW_OBJECTIVE_CHARS,
  readBuilderObjective,
} from '../lib/builder/request-contract.ts'

const route = readFileSync(new URL('../app/api/builder/route.ts', import.meta.url), 'utf8')
const developer = readFileSync(new URL('../app/dashboard/developer/page.tsx', import.meta.url), 'utf8')
const homepage = readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8')
const policy = readFileSync(new URL('../lib/ai/cos/cosReasoningRolePolicy.ts', import.meta.url), 'utf8')
const migration = readFileSync(new URL('../supabase/migrations/20260831184000_builder_objective_contract_alignment.sql', import.meta.url), 'utf8')
const gate = readFileSync(new URL('../scripts/vercel-cos-gates.mjs', import.meta.url), 'utf8')

function rejectedCode(run: () => unknown): string {
  let caught: unknown
  try { run() } catch (error) { caught = error }
  assert.ok(caught instanceof BuilderObjectiveError)
  return caught.code
}

test('Builder accepts the objective size that Production previously rejected at 8,001 characters', () => {
  const objective = 'x'.repeat(8_001)
  const parsed = readBuilderObjective({ objective })
  assert.equal(parsed.objective, objective)
  assert.equal(parsed.length, 8_001)
  assert.equal(parsed.source, 'objective')
})

test('Builder compacts copied context at the 64,000-character durable boundary', () => {
  const objective = 'x'.repeat(MAX_BUILDER_OBJECTIVE_CHARS)
  assert.equal(readBuilderObjective({ objective }).length, MAX_BUILDER_OBJECTIVE_CHARS)
  const oversized = `Fix broken.js.\n${'middle\n'.repeat(12_000)}ReferenceError: result is not defined`
  const parsed = readBuilderObjective({ objective: oversized })
  assert.equal(parsed.length, MAX_BUILDER_OBJECTIVE_CHARS)
  assert.match(parsed.objective, /^Fix broken\.js\./)
  assert.match(parsed.objective, /omitted copied middle context/)
  assert.match(parsed.objective, /ReferenceError: result is not defined$/)
  assert.equal(
    rejectedCode(() => readBuilderObjective({ objective: 'x'.repeat(MAX_BUILDER_RAW_OBJECTIVE_CHARS + 1) })),
    'builder_objective_too_large',
  )
})

test('Developer workspace exposes the same raw intake cap instead of clipping logs at 8,000 characters', () => {
  assert.match(developer, /MAX_BUILDER_RAW_OBJECTIVE_CHARS/)
  assert.match(developer, /suggestedObjective\.slice\(0, MAX_BUILDER_RAW_OBJECTIVE_CHARS\)/)
  assert.match(developer, /maxLength=\{MAX_BUILDER_RAW_OBJECTIVE_CHARS\}/)
  assert.doesNotMatch(developer, /suggestedObjective\.slice\(0, 8_000\)/)
  assert.doesNotMatch(developer, /maxLength=\{?8000\}?/)
})

test('Homepage Concierge preserves long pasted diagnostics through the same raw intake cap', () => {
  assert.match(homepage, /import \{ MAX_BUILDER_RAW_OBJECTIVE_CHARS \} from '@\/lib\/builder\/request-contract'/)
  assert.match(homepage, /maxLength=\{MAX_BUILDER_RAW_OBJECTIVE_CHARS\}/)
  assert.doesNotMatch(homepage, /maxLength=\{?8000\}?/)
  const representativeLog = [
    'Running Vercel build',
    ...Array.from({ length: 3_500 }, (_, index) => `✔ unrelated passing test ${index}`),
    '✖ failing tests:',
    'test at tests/calcExpressions.node.test.ts:113:1',
    'AssertionError [ERR_ASSERTION]: lib/ai/cos/cosFirstAnswer.ts',
    'Error: Command "node scripts/vercel-cos-gates.mjs && npm run prebuild && next build" exited with 1',
  ].join('\n')
  assert.ok(representativeLog.length > 8_000)
  assert.ok(representativeLog.length < MAX_BUILDER_RAW_OBJECTIVE_CHARS)
  const parsed = readBuilderObjective({ objective: representativeLog })
  assert.match(parsed.objective, /tests\/calcExpressions\.node\.test\.ts:113:1/)
  assert.match(parsed.objective, /exited with 1$/)
})

test('Builder recovers supported request envelopes instead of treating a missing objective field as empty', () => {
  assert.deepEqual(readBuilderObjective({ prompt: 'Debug src/app.ts and run the test.' }), {
    objective: 'Debug src/app.ts and run the test.',
    source: 'prompt',
    length: 34,
  })
  assert.equal(readBuilderObjective({ input: 'Fix broken.py with Python.' }).source, 'input')
  assert.deepEqual(readBuilderObjective({
    messages: [
      { role: 'assistant', content: 'Earlier answer' },
      { role: 'user', content: [{ type: 'text', text: 'Debug the attached file.' }] },
    ],
  }), {
    objective: 'Debug the attached file.',
    source: 'messages',
    length: 24,
  })
})

test('missing Builder instructions fail with a precise public-safe error code', () => {
  assert.equal(rejectedCode(() => readBuilderObjective({})), 'builder_objective_required')
  assert.equal(rejectedCode(() => readBuilderObjective({ objective: '   ' })), 'builder_objective_required')
})

test('the Builder route uses the shared extractor and never exposes builder_invalid_objective', () => {
  assert.match(route, /readBuilderObjective\(body\)\.objective/)
  assert.match(route, /builder_objective_rejected/)
  assert.match(route, /observedLength: error\.observedLength/)
  assert.match(route, /No workspace or job was created/)
  assert.doesNotMatch(route, /builder_invalid_objective/)
})

test('routing, API validation, durable storage, and deployment gates use one objective contract', () => {
  assert.match(policy, /MAX_BUILDER_OBJECTIVE_CHARS/)
  assert.match(policy, /raw\.length > MAX_BUILDER_OBJECTIVE_CHARS/)
  assert.match(migration, /char_length\(objective\) between 1 and 64000/)
  assert.match(migration, /builder_job_objective_required/)
  assert.match(migration, /builder_job_objective_too_large/)
  assert.match(migration, /set search_path = public, pg_temp/)
  assert.match(migration, /revoke all on function[\s\S]*from public, anon, authenticated/)
  assert.match(migration, /grant execute on function[\s\S]*to service_role/)
  assert.match(gate, /tests\/builderObjectiveContract\.node\.test\.ts/)
})