import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { classifyOwnerEmail } from '../lib/ai/cos/ownerExecutiveBriefingPolicy.ts'

const message = (overrides: Record<string, unknown> = {}) => ({
  id:'m1', threadId:'t1', from:'sender@example.com', subject:'Hello', date:'', internalDate:'2026-09-06T10:00:00.000Z',
  snippet:'Ordinary update', labels:['INBOX','UNREAD'], ...overrides,
} as any)

test('Gmail importance classification is bounded and evidence-derived', () => {
  assert.equal(classifyOwnerEmail(message()).severity, 'routine')
  assert.equal(classifyOwnerEmail(message({ labels:['IMPORTANT'] })).severity, 'important')
  assert.equal(classifyOwnerEmail(message({ subject:'Security alert: immediate action required' })).severity, 'urgent')
  assert.equal(classifyOwnerEmail(message({ subject:'Travel approval requested' })).severity, 'important')
})

test('Google OAuth requests Gmail read-only and never mailbox mutation scopes', async () => {
  const source = await readFile(new URL('../lib/google-workspace/oauth.ts', import.meta.url), 'utf8')
  assert.match(source, /auth\/gmail\.readonly/)
  assert.doesNotMatch(source, /auth\/gmail\.(modify|compose|send)/)
})

test('owner briefing is scheduled, cron-authenticated, deduplicated, and service-only', async () => {
  const [route, vercel, migration] = await Promise.all([
    readFile(new URL('../app/api/cron/cos-owner-briefing/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../vercel.json', import.meta.url), 'utf8'),
    readFile(new URL('../supabase/migrations/20260906173000_cos_owner_briefing_delivery.sql', import.meta.url), 'utf8'),
  ])
  assert.match(route, /Bearer \$\{secret\}/)
  assert.match(vercel, /api\/cron\/cos-owner-briefing/)
  assert.match(migration, /unique \(owner_email, source_type, source_id\)/)
  assert.match(migration, /enable row level security/g)
  assert.match(migration, /revoke all .* from anon, authenticated/g)
})

test('briefing reads only Gmail metadata and preserves mailbox state', async () => {
  const [source, briefing] = await Promise.all([
    readFile(new URL('../lib/google-workspace/gmail.ts', import.meta.url), 'utf8'),
    readFile(new URL('../lib/ai/cos/ownerExecutiveBriefing.ts', import.meta.url), 'utf8'),
  ])
  assert.match(source, /format: 'metadata'/)
  assert.doesNotMatch(source, /method:\s*['"](POST|PUT|PATCH|DELETE)/)
  assert.doesNotMatch(source, /messages\/(send|trash|modify)/)
  assert.match(briefing, /query: 'newer_than:2d'/)
  assert.doesNotMatch(briefing, /query: 'is:unread/)
})
