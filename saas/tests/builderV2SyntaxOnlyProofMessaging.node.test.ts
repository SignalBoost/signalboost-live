import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { BUILDER_RESULT_DONE, BUILDER_RESULT_SYNTAX_ONLY } from '../lib/ai/cos/assistanceMode.ts'
import { SUPPORTED_LANGUAGES } from '../lib/i18n/supportedLanguages.ts'

test('Builder V2 terminal history distinguishes syntax checks from behavioral verification', () => {
  const runner = readFileSync(new URL('../lib/builder/job-runner.ts', import.meta.url), 'utf8')
  assert.match(runner, /const syntaxOnly = commandsProven\.length > 0/)
  assert.match(runner, /commandsProven\.every\(command => \/\^node/)
  assert.match(runner, /assistanceCopy\(syntaxOnly \? BUILDER_RESULT_SYNTAX_ONLY : BUILDER_RESULT_DONE, job\.metadata\.responseLanguage\)/)
})

test('a syntax check alone is never told to the person as a working result, in every language', () => {
  for (const lang of SUPPORTED_LANGUAGES) {
    assert.ok(BUILDER_RESULT_SYNTAX_ONLY[lang].length > 20, lang)
    assert.notEqual(BUILDER_RESULT_SYNTAX_ONLY[lang], BUILDER_RESULT_DONE[lang], lang)
  }
  assert.match(BUILDER_RESULT_SYNTAX_ONLY.en, /not run/)
})
