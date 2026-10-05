// saas/tests/cosUniversityErrorText.node.test.ts
//
// The telemetry page printed "[object Object]" under "Observed throughput & recovery": Supabase (PostgREST) failures are
// plain objects, and the report turned them into text with String(). errorText names the code, message and details.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { errorText } from '../lib/ai/cos/cosUniversityErrorText.ts'

test('a PostgREST error object is described by code, message and details', () => {
  const postgrest = { message: 'relation "public.cos_university_lifecycle_transition_history" does not exist', code: '42P01', details: null, hint: null }
  assert.equal(errorText(postgrest), '42P01: relation "public.cos_university_lifecycle_transition_history" does not exist')
  assert.equal(errorText({ message: 'canceling statement due to statement timeout', code: '57014', details: 'read took 8s' }),
    '57014: canceling statement due to statement timeout (read took 8s)')
  assert.equal(errorText({ code: 'PGRST301' }), 'PGRST301')
  assert.equal(errorText({ message: 'JWT expired' }), 'JWT expired')
})

test('Error instances, strings and odd values stay readable and never print [object Object]', () => {
  assert.equal(errorText(new Error('network down')), 'network down')
  assert.equal(errorText('plain failure'), 'plain failure')
  assert.equal(errorText(null), '')
  assert.equal(errorText({ status: 503 }), '{"status":503}')
  assert.equal(errorText({}), 'unreadable_error_object')
  const circular: Record<string, unknown> = {}
  circular.self = circular
  assert.equal(errorText(circular), 'unreadable_error_object')
  for (const value of [{ message: 'x', code: 'y' }, { status: 1 }, {}, circular, new Error('e')]) {
    assert.doesNotMatch(errorText(value), /\[object Object\]/)
  }
})

test('the text is bounded and single-line', () => {
  const long = errorText({ code: 'X1', message: 'a\n'.repeat(500) }, 40)
  assert.equal(long.length, 40)
  assert.doesNotMatch(long, /\n/)
})

test('the funnel and the artifact life record describe unreadable tables with errorText', () => {
  const funnel = readFileSync(new URL('../lib/ai/cos/cosUniversityEffectivenessFunnel.ts', import.meta.url), 'utf8')
  const life = readFileSync(new URL('../lib/ai/cos/cosUniversityArtifactLifeRecord.ts', import.meta.url), 'utf8')
  for (const source of [funnel, life]) {
    assert.match(source, /import \{ errorText \} from '\.\/cosUniversityErrorText\.ts'/)
    assert.match(source, /catch \(error\) \{ return Object\.freeze\(\{ available: false as const, error: errorText\(error, 300\) \}\) \}/)
    assert.doesNotMatch(source, /text\(error instanceof Error \? error\.message : error/)
  }
  assert.match(life, /detail: errorText\(error, 300\) \}\)/)
})
// end of saas/tests/cosUniversityErrorText.node.test.ts (if this line is missing, the paste was cut short)
