import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

test('canonical Self-Healing loop includes University distillation and governed remediation', async () => {
  const route = await readFile(new URL('../app/api/cron/native-proactive-monitoring/route.ts', import.meta.url), 'utf8')
  assert.match(route, /universityMassDistillationMonitoringCollector/)
  assert.match(route, /collectors:\s*\[/)
  assert.match(route, /universityMassDistillationMonitoringCollector\(\{ db \}\)/)
  assert.match(route, /remediateNativeIncidents\(incidents, \{ maxIncidents: 4 \}\)/)
  assert.match(route, /verifyPendingExactVercelRepairOutcomes/)
})

test('canonical Self-Healing loop is scheduled every five minutes', async () => {
  const vercel = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'))
  const cron = vercel.crons.find((row: any) => row.path === '/api/cron/native-proactive-monitoring')
  assert.deepEqual(cron, { path: '/api/cron/native-proactive-monitoring', schedule: '*/5 * * * *' })
})

test('University keeps its dedicated five-minute supervisor as defense in depth', async () => {
  const vercel = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'))
  const cron = vercel.crons.find((row: any) => row.path === '/api/cron/cos-university-distillation-supervisor')
  assert.equal(cron?.schedule, '2,7,12,17,22,27,32,37,42,47,52,57 * * * *')
})
