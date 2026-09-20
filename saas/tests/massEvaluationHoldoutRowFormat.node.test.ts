// saas/tests/massEvaluationHoldoutRowFormat.node.test.ts
// Production 2026-09-20 00:51 UTC: /api/cron/cos-university-mass-distilled-evaluation returned 500 with
// mass_distilled_evaluation_holdout_format_invalid. That error is thrown per row but fails the WHOLE
// evaluation, so a single unparsed holdout row stops an artifact being evaluated at all - and roughly 151
// artifacts are waiting on that lane. The cause was a disagreement between the writer and the reader:
// scripts/cos-university-hf-worker-base.py renders a chat row as role blocks joined by blank lines, so a row
// carrying a system message becomes "<system>\n...\n\n<user>\n...\n\n<assistant>\n...", while the evaluator's
// parser required the text to START with the user block. These assertions pin the widened contract and,
// just as importantly, the rows that must still be rejected.
import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

const SOURCE = readFileSync(
  new URL('../lib/ai/cos/cosUniversityMassDistilledArtifactEvaluation.ts', import.meta.url),
  'utf8',
)
const WORKER = readFileSync(
  new URL('../scripts/cos-university-hf-worker-base.py', import.meta.url),
  'utf8',
)

/** The live parser, lifted from source so the test cannot drift from the shipped implementation. */
function parseTrainingText(text: string): { prompt: string; reference: string } | null {
  const start = SOURCE.indexOf('function parseTrainingText')
  const end = SOURCE.indexOf('// The fixed suites are regression gates')
  assert.ok(start > 0 && end > start, 'parseTrainingText must remain locatable in source')
  const body = SOURCE.slice(start, end)
    .replace(/^function parseTrainingText\(text:string\):\{prompt:string;reference:string\}\|null\{/, '')
    .replace(/\}\s*$/, '')
  return new Function('text', body)(text)
}

test('the row shape the worker actually writes for a chat message list parses', () => {
  // This is the exact shape produced by the worker's role-rendering branch.
  const row = '<system>\nYou are terse.\n\n<user>\nOption A pays $100 with probability 0.6.\n\n<assistant>\nOption B, by $7.'
  const parsed = parseTrainingText(row)
  assert.ok(parsed, 'a row with a leading system block must parse')
  assert.equal(parsed.prompt, 'Option A pays $100 with probability 0.6.')
  assert.equal(parsed.reference, 'Option B, by $7.')
})

test('the plain two-block row is unchanged', () => {
  const parsed = parseTrainingText('<user>\nWhat is 2+2?\n\n<assistant>\n4')
  assert.ok(parsed)
  assert.equal(parsed.prompt, 'What is 2+2?')
  assert.equal(parsed.reference, '4')
})

test('an unusable row is still rejected, so a damaged holdout cannot pass', () => {
  for (const [label, row] of [
    ['no user turn', '<assistant>\n4'],
    ['prompt with no answer', 'Just a prompt and no answer at all'],
    ['answer with no markers', '4'],
    ['empty', ''],
    ['role tag inside prose only', 'the string <user> appears mid sentence'],
  ] as const) {
    assert.equal(parseTrainingText(row), null, `${label} must not parse`)
  }
})

test('a user block with an empty question or empty answer is rejected', () => {
  assert.equal(parseTrainingText('<user>\n\n\n<assistant>\n4'), null)
  assert.equal(parseTrainingText('<user>\nWhat is 2+2?\n\n<assistant>\n'), null)
})

test('the writer still emits the role-block shape this parser now accepts', () => {
  // If the worker's rendering changes, this reader must be revisited - that mismatch is the whole defect.
  assert.match(WORKER, /<\{role\}>\\n\{content\}/)
  assert.match(WORKER, /<user>\\n\{prompt\}\\n\\n<assistant>\\n\{answer\}/)
})

test('an unparsed row reports its structure so the shape can be identified without reading the dataset', () => {
  // Production 2026-09-20 01:25-01:29: holdout_format_invalid repeated every two minutes, each attempt
  // consuming a rolling claim, and named nothing about the offending row - so the real shape could not be
  // told apart from one already handled. The error now carries structure and never content.
  assert.match(SOURCE, /mass_distilled_evaluation_holdout_format_invalid:\$\{shape\}/)
  assert.match(SOURCE, /cols=\$\{\[parsed\.prompt \? 'prompt' : ''/)
  assert.match(SOURCE, /len=\$\{rowText\.length\}/)
  assert.match(SOURCE, /opens=\$\{opener \? opener\[1\]\.toLowerCase\(\) : 'plain'\}/)
  assert.match(SOURCE, /user=\$\{rowText\.includes\('<user>/)
  assert.match(SOURCE, /assistant=\$\{marker >= 0 \? 1 : 0\}/)
  // Structure only: the row's own text must never be interpolated into the error.
  const thrown = SOURCE.slice(SOURCE.indexOf('if (!parsed.prompt || !parsed.reference)'), SOURCE.indexOf('`mass_distilled_evaluation_holdout_format_invalid:${shape}`'))
  assert.doesNotMatch(thrown, /\$\{rowText\}/)
  assert.doesNotMatch(thrown, /rowText\.slice\(/)
})

test('both the rolling authority and the quarantine branch match this error by prefix', () => {
  // The fingerprint suffix would otherwise fall out of an exact-equality comparison, and each fingerprinted
  // failure would consume the artifact's substantive attempts and the 24h approval window instead of being
  // released as evaluator infrastructure - and the poisoned holdout would never be quarantined.
  const authority = readFileSync(new URL('../lib/ai/cos/cosUniversityMassEvaluationRollingAuthority.ts', import.meta.url), 'utf8')
  const route = readFileSync(new URL('../app/api/cron/cos-university-mass-distilled-evaluation/route.ts', import.meta.url), 'utf8')
  assert.match(authority, /error\.startsWith\('mass_distilled_evaluation_holdout_format_invalid'\)/)
  assert.match(route, /message\.startsWith\('mass_distilled_evaluation_holdout_format_invalid'\)/)
  assert.doesNotMatch(authority, /error === 'mass_distilled_evaluation_holdout_format_invalid'/)
  assert.doesNotMatch(route, /message === 'mass_distilled_evaluation_holdout_format_invalid'/)
})

test('holdout integrity and count checks are untouched by the parse widening', () => {
  // Widening what parses must never widen what is trusted.
  assert.match(SOURCE, /mass_distilled_evaluation_holdout_integrity_failed/)
  assert.match(SOURCE, /mass_distilled_evaluation_holdout_count_invalid/)
  assert.match(SOURCE, /mass_distilled_evaluation_holdout_revision_moved/)
  assert.match(SOURCE, /sha256Raw\(text\)\s*!==\s*itemHash/)
})

test('structured prompt/response columns still take precedence over text parsing', () => {
  assert.match(SOURCE, /const structuredPrompt = clean\(row\.prompt, 100_000\)/)
  assert.match(SOURCE, /const structuredReference = clean\(row\.response, 100_000\)/)
  assert.match(SOURCE, /structuredPrompt && structuredReference/)
  assert.match(SOURCE, /parseTrainingText\(text\)/)
})

test('response-only legacy hosted rows are recovered only after immutable manifest validation', () => {
  assert.match(SOURCE, /legacyHostedPromptByResponseHash/)
  const manifestGate = SOURCE.indexOf('manifestHash(observed) !== input.expectedManifestHash')
  const legacyRecovery = SOURCE.indexOf('await legacyHostedPromptByResponseHash')
  assert.ok(manifestGate >= 0 && legacyRecovery > manifestGate)
  assert.match(SOURCE, /reference: row\.text/)
})

// Legacy hosted rows are immutable response-only evidence; prompt recovery must stay exact-bound and fail closed.
