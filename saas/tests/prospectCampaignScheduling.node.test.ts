import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const core = readFileSync(resolve(here, '../lib/outreach/prospectCampaignCore.ts'), 'utf8')
const concierge = readFileSync(resolve(here, '../app/api/concierge/route.ts'), 'utf8')

test('prospect worker supports exact-job handoff and fair cron scheduling', () => {
  assert.match(core, /advanceProspectCampaigns\(jobId\?: string\)/)
  assert.match(core, /claim\.eq\('id', jobId\)/)
  assert.match(core, /order\('updated_at', \{ ascending: true \}\)/)
  assert.match(concierge, /advanceProspectCampaigns\(started\.job\.id\)/)
})
