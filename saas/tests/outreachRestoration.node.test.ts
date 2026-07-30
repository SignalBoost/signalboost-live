import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { OUTREACH_COPY, outreachNavLabel } from '../lib/i18n/outreachCopy.ts'
import { hydrateLocalizedSource } from './helpers/hydrateLocalizedSource.ts'

async function source(relativePath: string): Promise<string> {
  return readFile(path.resolve(process.cwd(), relativePath), 'utf8').then(hydrateLocalizedSource)
}

test('Outreach is restored as the five-language umbrella instead of Email Outreach', () => {
  assert.equal(outreachNavLabel('en'), 'Outreach')
  assert.equal(outreachNavLabel('es'), 'Alcance')
  assert.equal(outreachNavLabel('pt'), 'Prospecção')
  assert.equal(outreachNavLabel('pl'), 'Outreach')
  assert.equal(outreachNavLabel('ru'), 'Аутрич')
  assert.deepEqual(Object.keys(OUTREACH_COPY).sort(), ['en', 'es', 'pl', 'pt', 'ru'])
  for (const copy of Object.values(OUTREACH_COPY)) {
    assert.match(copy.definition, /Email|correo|e-mail|E-mail|Электронная/i)
    assert.equal(Object.keys(copy.channels).length, 7)
  }
})

test('legacy navbar key is overridden before stale locale values are read', async () => {
  const translation = await source('lib/i18n/t.ts')
  assert.match(translation, /if \(path === 'nav\.emailOutreach'\) return outreachNavLabel\(safeLang\)/)
  assert.ok(
    translation.indexOf("path === 'nav.emailOutreach'") < translation.indexOf('const value = lookup'),
    'the broad Outreach override must win over old Email Outreach locale values',
  )
})

test('Outreach Center reconnects COS, human work, approvals, pipeline, and admin monitoring', async () => {
  const hub = await source('app/dashboard/outreach/page.tsx')
  assert.match(hub, /\/dashboard\/assistant/)
  assert.match(hub, /\/dashboard\/outreach\/discovery/)
  assert.match(hub, /\/dashboard\/outreach\/contacts/)
  assert.match(hub, /\/dashboard\/outreach\/pipeline/)
  assert.match(hub, /\/dashboard\/outreach\/outreach/)
  assert.match(hub, /\/admin\/outreach/)
  assert.match(hub, /onlinePress/)
  assert.match(hub, /printPress/)
  assert.match(hub, /tradePress/)
  assert.match(hub, /manual/)
})

test('Chief of Staff stages verified prospect drafts but never treats staging as permission to send', async () => {
  const architect = await source('lib/ai/cosArchitect.ts')
  assert.match(architect, /OUTREACH CAMPAIGN WORKFLOW — HARD INVARIANT/)
  assert.match(architect, /Use getExternalInfo for live public research/)
  assert.match(architect, /call createOutreachDraft/)
  assert.match(architect, /status PENDING/)
  assert.match(architect, /Send NOTHING/)
  assert.match(architect, /If the owner says research only/)
  assert.match(architect, /Never invent a company, URL, contact/)
})

test('Admin sidebar restores a dedicated Outreach monitoring destination', async () => {
  const platform = await source('lib/platform/unifiedPlatform.ts')
  const adminPage = await source('app/admin/outreach/page.tsx')
  assert.match(platform, /label: 'Outreach', href: '\/admin\/outreach'/)
  assert.match(adminPage, /AdmConsoleClient/)
})

test('existing approval, panic switch, daily limit, audit, and manual record safeguards remain intact', async () => {
  const sendRoute = await source('app/api/outreach/send/route.ts')
  const adminConsole = await source('components/admin/outreach/AdmConsoleClient.tsx')
  assert.match(sendRoute, /isOutreachSendingDisabled/)
  assert.match(sendRoute, /enforceDailySendLimit\(ctx\.admin, 50\)/)
  assert.match(sendRoute, /outreach\.status !== 'approved'/)
  assert.match(sendRoute, /auditAdminAction/)
  assert.match(sendRoute, /mode: 'manual_record_only'/)
  assert.match(adminConsole, /channel: sendEmail \? 'email' : 'manual'/)
  assert.match(adminConsole, /selected\.status !== 'approved'/)
})
