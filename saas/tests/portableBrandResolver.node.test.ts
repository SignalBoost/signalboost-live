import test from 'node:test'
import assert from 'node:assert/strict'

// Re-implements the resolver's decision to test it hermetically (the real functions
// read process.env; here we drive the same logic with explicit env maps). Keep in
// sync with saas/lib/portable/companyIdentity.ts portableBrandName.
function resolve(env: Record<string, string | undefined>): string {
  const configured = String(env.PORTABLE_BRAND_NAME || '').trim()
  if (configured) return configured
  const sold = String(env.PORTABLE_SOLD_COPY || '').trim().toLowerCase() === 'true'
  return sold ? '[YOUR COMPANY]' : (String(env.PORTABLE_BRAND_NAME || '').trim() || 'SignalBoost')
}

test('seller own deployment defaults to the platform brand', () => {
  assert.equal(resolve({}), 'SignalBoost')
  assert.equal(resolve({ PORTABLE_SOLD_COPY: 'false' }), 'SignalBoost')
})

test('a blank sold copy uses a neutral placeholder and never the seller brand', () => {
  const r = resolve({ PORTABLE_SOLD_COPY: 'true' })
  assert.equal(r, '[YOUR COMPANY]')
  assert.ok(!/signalboost/i.test(r))
})

test('a configured buyer gets their own brand (sold copy or white-label)', () => {
  assert.equal(resolve({ PORTABLE_SOLD_COPY: 'true', PORTABLE_BRAND_NAME: 'Acme Corp' }), 'Acme Corp')
  assert.equal(resolve({ PORTABLE_BRAND_NAME: 'Acme Corp' }), 'Acme Corp')
})

test('sold-copy flag is case-insensitive', () => {
  assert.equal(resolve({ PORTABLE_SOLD_COPY: 'TRUE' }), '[YOUR COMPANY]')
})
