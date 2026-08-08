import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { isOwnerEngineeringRequest } from '../lib/ai/cos/engineeringMission.ts'

test('broken outreach pipeline becomes a durable engineering mission', () => {
  assert.equal(isOwnerEngineeringRequest('the email outreach campaign is not working, fix it'), true)
  assert.equal(isOwnerEngineeringRequest('scan repo and fix the outreach pipeline'), true)
  assert.equal(isOwnerEngineeringRequest('the dashboard API is broken, debug it'), true)
})

test('ordinary writing or campaign requests are not misrouted as engineering', () => {
  assert.equal(isOwnerEngineeringRequest('fix this email wording and make it professional'), false)
  assert.equal(isOwnerEngineeringRequest('create an email outreach campaign for 10 companies'), false)
  assert.equal(isOwnerEngineeringRequest('write me a marketing email'), false)
})

test('support router promotes engineering before campaign parsing', async () => {
  const source = await readFile(new URL('../app/api/support/route.ts', import.meta.url), 'utf8')
  const engineering = source.indexOf('isOwnerEngineeringRequest(text)')
  const press = source.indexOf('parsePressCampaignRequest(text, lang)')
  const prospect = source.indexOf('parseProspectCampaignRequest(text, lang)')
  assert.ok(engineering >= 0)
  assert.ok(engineering < press)
  assert.ok(engineering < prospect)
})

test('Vercel schedules the durable engineering worker', async () => {
  const config = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'))
  const cron = config.crons.find((item: any) => item.path === '/api/cron/cos-engineering-missions')
  assert.ok(cron)
  assert.equal(cron.schedule, '*/2 * * * *')
})
