import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('COS CRM contract is provider-neutral and product-aware', async () => {
  const source = await readFile(new URL('../lib/ai/cos/gtm/crmConnector.ts', import.meta.url), 'utf8')
  assert.match(source, /interface ICosCrmConnector/)
  assert.match(source, /productKey: string/)
  assert.match(source, /getProspectByEmail/)
  assert.match(source, /markProductStage/)
  assert.doesNotMatch(source, /HubSpotClient|SalesforceClient/)
})

test('SignalBoost CRM connector reuses canonical outreach history', async () => {
  const source = await readFile(new URL('../lib/ai/cos/gtm/signalBoostCrmConnector.ts', import.meta.url), 'utf8')
  assert.match(source, /from\('outreach_queue'\)/)
  assert.match(source, /from\('outreach_sends'\)/)
  assert.match(source, /productKeyOf/)
  assert.match(source, /governed outreach pipeline/)
  assert.doesNotMatch(source, /create table|crm_prospects/)
})

test('COS CRM context blocks duplicate product introductions without templates', async () => {
  const source = await readFile(new URL('../lib/ai/cos/gtm/crmContext.ts', import.meta.url), 'utf8')
  assert.match(source, /alreadyContactedForProduct/)
  assert.match(source, /SENT.*REPLIED.*MEETING.*OPPORTUNITY.*WON/)
  assert.match(source, /facts-only/)
  assert.doesNotMatch(source, /subjectLine|messageBody|emailTemplate/)
})
