import assert from 'node:assert/strict'
import test from 'node:test'

import { readUiSourceAsync } from './helpers/sourceWithUiCopy.mjs'

const componentPath = new URL('../components/hub/ProviderActionExecutionGate.tsx', import.meta.url)

async function source(): Promise<string> {
  return readUiSourceAsync(componentPath)
}

test('execution gate renders only normalized reviewed capabilities', async () => {
  const text = await source()

  assert.match(text, /response\?\.reviewedCapabilities/)
  assert.match(text, /role="radiogroup"/)
  assert.match(text, /role="radio"/)
  assert.match(text, /aria-checked=\{active\}/)
})

test('execution gate chooses reviewed preferred mode and otherwise fails closed', async () => {
  const text = await source()

  assert.match(text, /response\.preferredMode/)
  assert.match(text, /available\[0\]\.mode/)
  assert.match(text, /No reviewed execution path is available/)
  assert.match(text, /This action is blocked by default/)
})

test('legacy form renders only for reviewed direct mode', async () => {
  const text = await source()

  assert.match(text, /selected\.mode === 'direct'/)
  assert.match(text, /\{children\}/)
  assert.match(text, /not enabled in this legacy form/)
})

test('non-direct modes remain explicitly non-executing', async () => {
  const text = await source()

  assert.match(text, /This screen will not launch a browser/)
  assert.match(text, /This screen will not submit a provider mutation/)
  assert.match(text, /No automated request will be sent/)
  assert.match(text, /Production browser execution remains disabled/)
})
