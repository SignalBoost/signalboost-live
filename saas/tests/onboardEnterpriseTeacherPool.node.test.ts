import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '../..')
const onboard = fs.readFileSync(path.join(ROOT, 'ONBOARD.md'), 'utf8')

test('ONBOARD records the Production enterprise teacher-pool contract', () => {
  assert.match(onboard, /Enterprise University teacher-pool contract/)
  assert.match(onboard, /Qwen and DeepSeek/)
  assert.match(onboard, /Anthropic\/Claude/)
  assert.match(onboard, /xAI\/Grok/)
  assert.match(onboard, /buyer-owned credentials/)
  assert.match(onboard, /never silently substitute another provider or model/)
  assert.match(onboard, /Apache-2\.0 and MIT/)
  assert.match(onboard, /provider-independent/)
})
