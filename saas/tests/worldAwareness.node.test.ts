import assert from 'node:assert/strict'
import test from 'node:test'
import { awarenessRow, normalizeAwarenessObservedAt } from '../lib/ai/cos/worldAwareness.ts'

test('normalizes GDELT compact timestamps',()=>{
  assert.equal(normalizeAwarenessObservedAt('20260815T123456Z'), '2026-08-15T12:34:56.000Z')
})

test('world awareness records are sourced and expire instead of becoming permanent truth',()=>{
  const now=Date.parse('2026-08-15T13:00:00.000Z')
  const ttl=72*60*60*1000
  const row=awarenessRow('world','news_article',{
    uri:'https://news.example/story',
    title:'Current world event',
    text:'A compact sourced news signal.',
    observedAt:'2026-08-15T12:30:00.000Z',
  },now,ttl)
  assert.ok(row)
  assert.equal(row?.source_uri,'https://news.example/story')
  assert.equal(row?.observed_at,'2026-08-15T12:30:00.000Z')
  assert.equal(row?.ingested_at,'2026-08-15T13:00:00.000Z')
  assert.equal(row?.expires_at,'2026-08-18T12:30:00.000Z')
})
