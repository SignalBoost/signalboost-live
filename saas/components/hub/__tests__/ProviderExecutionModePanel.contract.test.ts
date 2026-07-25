import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'

describe('ProviderExecutionModePanel capability-first contract', () => {
  const source = readFileSync(
    join(process.cwd(), 'components/hub/ProviderExecutionModePanel.tsx'),
    'utf8',
  )

  it('discovers reviewed capabilities before requesting a payload preview', () => {
    assert.ok(source.includes("fetch('/api/hub/action/capabilities'"))
    assert.ok(source.includes("fetch('/api/hub/action/preview'"))
    assert.ok(
      source.indexOf("fetch('/api/hub/action/capabilities'") <
        source.indexOf("fetch('/api/hub/action/preview'"),
    )
  })

  it('keeps product-facing execution path labels', () => {
    assert.ok(source.includes("cosa_pr: 'Governed AI infrastructure PR'"))
    assert.ok(source.includes("browser_agent: 'Browser Agent assistance'"))
    assert.ok(source.includes("manual: 'Direct configuration'"))
    assert.ok(!source.includes("manual: 'Manual"))
  })

  it('supports capability discovery while preview is disabled', () => {
    assert.ok(source.includes('previewEnabled?: boolean'))
    assert.ok(source.includes('previewEnabled = true'))
    assert.ok(source.includes("if (!previewEnabled || !capabilityResponse?.ok)"))
  })

  it('fails closed when a selected mode is not available', () => {
    assert.ok(source.includes('!data.availableModes.includes(selectedMode)'))
    assert.ok(source.includes('data.preferredMode'))
    assert.ok(source.includes('data.availableModes[0]'))
  })

  it('shows review provenance without enabling execution', () => {
    assert.ok(source.includes('Reviewed by {capabilityResponse.reviewed.reviewer}'))
    assert.ok(!source.includes('window.open('))
    assert.ok(!source.includes('browser.launch'))
  })
})
