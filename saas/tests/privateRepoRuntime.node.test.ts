import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const i18nSweep = readFileSync(new URL('../lib/ai/tools/i18nSweep.ts', import.meta.url), 'utf8')
const repairScript = readFileSync(new URL('../scripts/repair-cos-runpod-runner.sh', import.meta.url), 'utf8')
const startupScript = readFileSync(new URL('../scripts/runpod-cos-reasoner.sh', import.meta.url), 'utf8')

test('internal private-repo runtime paths do not depend on anonymous raw GitHub', () => {
  assert.doesNotMatch(i18nSweep, /raw\.githubusercontent\.com/)
  assert.doesNotMatch(repairScript, /raw\.githubusercontent\.com/)
  assert.match(i18nSweep, /api\.github\.com\/repos\//)
  assert.match(i18nSweep, /GITHUB_WRITE_TOKEN/)
})

test('RunPod recovery reuses the governed bootstrap instead of overwriting it', () => {
  assert.match(repairScript, /COS_REASONER_BOOTSTRAP_PATH/)
  assert.match(repairScript, /cos-runpod-reasoner\.sh/)
  assert.doesNotMatch(repairScript, /mv .*cos-runpod-reasoner\.sh/)
  assert.match(startupScript, /OLLAMA_CONTEXT_LENGTH/)
  assert.match(startupScript, /OLLAMA_NUM_PARALLEL/)
  assert.match(startupScript, /OLLAMA_MAX_LOADED_MODELS/)
  assert.match(startupScript, /OLLAMA_FLASH_ATTENTION/)
})
