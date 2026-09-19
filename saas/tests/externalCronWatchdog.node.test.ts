import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '../..')
const workflow = fs.readFileSync(path.join(ROOT, '.github/workflows/self-healing-cron-watchdog.yml'), 'utf8')
const watchdog = fs.readFileSync(path.join(ROOT, '.github/scripts/vercel-cron-watchdog.mjs'), 'utf8')

test('external cron watchdog is scheduled outside the Vercel cron control plane', () => {
  assert.match(workflow, /schedule:\s*[\s\S]*cron:\s*['"]\*\/5 \* \* \* \*['"]/)
  assert.match(workflow, /secrets\.VERCEL_TOKEN/)
  assert.match(workflow, /permissions:\s*[\s\S]*contents:\s*read/)
  assert.doesNotMatch(workflow, /contents:\s*write/)
})

test('watchdog detects Vercel project-level cron disablement and verifies recovery', () => {
  assert.match(watchdog, /project\?\.crons\?\.disabledAt/)
  assert.match(watchdog, /project\?\.crons\?\.definitions/)
  assert.match(watchdog, /external-self-healing-cron-watchdog/)
  assert.match(watchdog, /waitForCronRecovery/)
})

test('watchdog has no Vercel disable mutation', () => {
  assert.doesNotMatch(watchdog, /method:\s*['"](?:PATCH|DELETE)['"]/)
  assert.doesNotMatch(watchdog, /\/disable(?:[/'"?]|$)/i)
})

test('disabled Vercel scheduling cannot put Self-Healing and University fully to sleep', () => {
  assert.match(watchdog, /\/api\/cron\/native-proactive-monitoring/)
  assert.match(watchdog, /\/api\/cron\/cos-university-distillation-supervisor/)
  assert.match(watchdog, /\/api\/cron\/cos-university-mass-distillation/)
  assert.match(watchdog, /env\?decrypt=true/)
  assert.match(watchdog, /::add-mask::/)
})
