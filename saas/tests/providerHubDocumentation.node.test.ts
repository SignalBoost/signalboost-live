import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { hydrateLocalizedSource } from './helpers/hydrateLocalizedSource.ts'


const guideUrl = new URL('../../docs/portables/provider-hub-security-operations-acceptance.md', import.meta.url)
const statusUrl = new URL('../../docs/portables/provider-hub-implementation-status.md', import.meta.url)

test('Provider Hub closure guide covers required operating and acceptance sections', async () => {
  const guide = await readFile(guideUrl, 'utf8').then(hydrateLocalizedSource)
  const required = [
    '## 2. Security architecture and trust boundaries',
    '## 3. Threat model and required mitigations',
    '## 4. Compliance and evidence responsibility matrix',
    '## 5. Installation and configuration',
    '## 6. Upgrade, migration, and rollback',
    '## 7. Backup and recovery',
    '## 8. Acceptance checklist',
    '## 9. Release decision',
    '## 10. Permanent safety notices',
  ]

  for (const section of required) assert.equal(guide.includes(section), true, `missing ${section}`)
})

test('Provider Hub documentation preserves non-production and no-secret claims', async () => {
  const [guide, status] = await Promise.all([
    readFile(guideUrl, 'utf8').then(hydrateLocalizedSource),
    readFile(statusUrl, 'utf8').then(hydrateLocalizedSource),
  ])
  const combined = `${guide}\n${status}`
  const requiredNotices = [
    'not independently certified',
    'Raw credentials are never public responses.',
    'Automatic approval is disabled.',
    'Provider mutation is disabled unless separately implemented and approved.',
    'Production execution requires explicit authorization, policy, approval, audit, and rollback controls.',
    'It does not verify a universally production-ready enterprise deployment.',
  ]

  for (const notice of requiredNotices) assert.equal(combined.includes(notice), true, `missing notice: ${notice}`)
  for (const forbiddenClaim of ['SOC 2 certified', 'ISO 27001 certified', 'FedRAMP authorized', 'production-proven enterprise deployment']) {
    assert.equal(combined.includes(forbiddenClaim), false, `unsupported claim present: ${forbiddenClaim}`)
  }
})

test('Provider Hub implementation status records all eight phases without enabling execution', async () => {
  const status = await readFile(statusUrl, 'utf8').then(hydrateLocalizedSource)
  for (let phase = 1; phase <= 8; phase += 1) {
    assert.match(status, new RegExp(`\\| ${phase} \\| Complete \\|`))
  }
  assert.equal(status.includes('Consequential actions remain disabled'), true)
})
