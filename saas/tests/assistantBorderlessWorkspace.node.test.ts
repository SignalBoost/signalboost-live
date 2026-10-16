import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('../app/dashboard/assistant/page.tsx', import.meta.url), 'utf8')
test('COS assistant uses full viewport canvas without outer card', () => {
  assert.match(source, /maxWidth: 'none', margin: 0, padding: 0/)
  assert.match(source, /background: 'transparent', border: 'none', borderRadius: 0, boxShadow: 'none'/)
  assert.doesNotMatch(source, /maxWidth: 1600, margin: '0 auto', padding: '16px'/)
})
test('only prompt entry has a compact framed surface; assistant reply is unframed', () => {
  assert.match(source, /maxWidth: 980, margin: '0 auto'/)
  assert.match(source, /msg.role === 'user' \? 'rgba\(255,195,0,.12\)' : 'transparent'/)
  assert.match(source, /msg.role === 'user' \? '1px solid rgba\(255,195,0,.28\)' : 'none'/)
})
