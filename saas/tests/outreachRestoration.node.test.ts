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
  assert.match(architect, /Never invent a company, URL, contact/)
})

test('do-not-send language preserves the internal outreach approval handoff', async () => {
  const architect = await source('lib/ai/cosArchitect.ts')
  assert.match(architect, /"do not send"[\s\S]*prohibits EXTERNAL ACTION only/)
  assert.match(architect, /It does NOT prohibit[\s\S]*internal pending drafts/)
  assert.match(architect, /still call[\s\S]*createOutreachDraft[\s\S]*approval queue/)
  assert.match(architect, /Suppress createOutreachDraft only when[\s\S]*RESEARCH ONLY/)
  assert.match(architect, /not to create, store, save, or queue drafts/)
  assert.match(architect, /Never satisfy an outreach-draft request by printing drafts only in chat/)
  assert.doesNotMatch(
    architect,
    /research only, do not contact, do not send, or otherwise negates[\s\S]*call no draft/,
    'do-not-send must not be conflated with do-not-stage',
  )
})

test('Admin sidebar restores a dedicated Outreach monitoring destination', async () => {
  const platform = await source('lib/platform/unifiedPlatform.ts')
  const adminPage = await source('app/admin/outreach/page.tsx')
  assert.match(platform, /label: 'Outreach', href: '\/admin\/outreach'/)
  assert.match(adminPage, /AdmConsoleClient/)
  assert.match(adminPage, /\/admin\/outreach\/delivery/)
})

test('human approval releases the email through Resend while preserving every safety gate', async () => {
  const queueRoute = await source('app/api/outreach/queue/route.ts')
  assert.match(queueRoute, /status === 'approved' && body\?\.release !== false/)
  assert.match(queueRoute, /from\('outreach_sends'\)[\s\S]*eq\('outreach_id', id\)/)
  assert.match(queueRoute, /isOutreachSendingDisabled/)
  assert.match(queueRoute, /enforceDailySendLimit\(ctx\.admin, 50\)/)
  assert.match(queueRoute, /assertSafeOutreachMessage/)
  assert.match(queueRoute, /sendEmail\(\{/)
  assert.match(queueRoute, /from: 'saasSales'/)
  assert.match(queueRoute, /from\('outreach_sends'\)\.insert/)
  assert.match(queueRoute, /markOutreachSent/)
  assert.match(queueRoute, /outreach\.approved_and_sent/)
  assert.match(queueRoute, /alreadySent: true/)
})

test('contacts show Sent, release approved records, and expose the Resend evidence monitor', async () => {
  const contacts = await source('app/dashboard/outreach/contacts/page.tsx')
  assert.match(contacts, /type Status = 'pending' \| 'approved' \| 'sent' \| 'rejected'/)
  assert.match(contacts, /Approve & Send/)
  assert.match(contacts, /\/api\/admin\/outreach\/send-ready\?send=1&limit=10/)
  assert.match(contacts, /\/admin\/outreach\/delivery/)
  assert.match(contacts, /sent: leads\.filter\(row => row\.status === 'sent'\)\.length/)
  assert.match(contacts, /data\?\.release\?\.ok/)
})

test('sent lifecycle tolerates production schema drift without losing the durable send ledger', async () => {
  const markSent = await source('lib/outreach/markSent.ts')
  const sendRoute = await source('app/api/outreach/send/route.ts')
  const batchRoute = await source('app/api/admin/outreach/send-ready/route.ts')

  assert.match(markSent, /update\(\{ status: 'sent', sent_at: sentAt \}\)/)
  assert.match(markSent, /update\(\{ status: 'sent' \}\)/)
  assert.match(markSent, /usedStatusOnlyFallback/)
  assert.match(sendRoute, /markOutreachSent/)
  assert.match(batchRoute, /markOutreachSent/)
  assert.match(batchRoute, /Already has outreach_sends record/)
})

test('Resend delivery history is visible and reconciles historical sends', async () => {
  const deliveryPage = await source('app/admin/outreach/delivery/page.tsx')
  const deliveryRoute = await source('app/api/admin/outreach/delivery-check/route.ts')
  const selftest = await source('app/api/admin/outreach/selftest/route.ts')
  const email = await source('lib/email.ts')

  assert.match(deliveryPage, /Verify what was really sent/)
  assert.match(deliveryPage, /\/api\/admin\/outreach\/selftest/)
  assert.match(deliveryPage, /\/api\/admin\/outreach\/delivery-check\?limit=25/)
  assert.match(deliveryRoute, /https:\/\/api\.resend\.com/)
  assert.match(deliveryRoute, /markOutreachSent/)
  assert.match(deliveryRoute, /statusOnlyFallbacks/)
  assert.match(selftest, /outreachSendsRows/)
  assert.match(selftest, /deliveryEventRows/)
  assert.match(selftest, /replyRows/)
  assert.match(email, /mode: 'resend'/)
})

test('manual record mode and the separate operational send route remain available', async () => {
  const sendRoute = await source('app/api/outreach/send/route.ts')
  const adminConsole = await source('components/admin/outreach/AdmConsoleClient.tsx')
  assert.match(sendRoute, /outreach\.status !== 'approved'/)
  assert.match(sendRoute, /mode: 'manual_record_only'/)
  assert.match(adminConsole, /channel: sendEmail \? 'email' : 'manual'/)
  assert.match(adminConsole, /selected\.status !== 'approved'/)
})
