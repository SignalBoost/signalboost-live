import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

test('HF mass distillation control loop wakes every minute while governance remains separate', () => {
  const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'))
  const worker = config.crons.find((row: any) => row.path === '/api/cron/cos-university-mass-distillation')
  const supervisor = config.crons.find((row: any) => row.path === '/api/cron/cos-university-distillation-supervisor')

  assert.deepEqual(worker, {
    path: '/api/cron/cos-university-mass-distillation',
    schedule: '* * * * *',
  })
  assert.deepEqual(supervisor, {
    path: '/api/cron/cos-university-distillation-supervisor',
    schedule: '2,7,12,17,22,27,32,37,42,47,52,57 * * * *',
  })
})
