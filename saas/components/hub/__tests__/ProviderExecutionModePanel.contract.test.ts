import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('ProviderExecutionModePanel capability-first contract', () => {
  const source = readFileSync(
    join(process.cwd(), 'components/hub/ProviderExecutionModePanel.tsx'),
    'utf8',
  )

  it('discovers reviewed capabilities before requesting a payload preview', () => {
    expect(source).toContain("fetch('/api/hub/action/capabilities'")
    expect(source).toContain("fetch('/api/hub/action/preview'")
    expect(source.indexOf("fetch('/api/hub/action/capabilities'")).toBeLessThan(
      source.indexOf("fetch('/api/hub/action/preview'"),
    )
  })

  it('keeps product-facing execution path labels', () => {
    expect(source).toContain("cosa_pr: 'Governed AI infrastructure PR'")
    expect(source).toContain("browser_agent: 'Browser Agent assistance'")
    expect(source).toContain("manual: 'Direct configuration'")
    expect(source).not.toContain("manual: 'Manual")
  })

  it('supports capability discovery while preview is disabled', () => {
    expect(source).toContain('previewEnabled?: boolean')
    expect(source).toContain('previewEnabled = true')
    expect(source).toContain("if (!previewEnabled || !capabilityResponse?.ok)")
  })

  it('fails closed when a selected mode is not available', () => {
    expect(source).toContain('!data.availableModes.includes(selectedMode)')
    expect(source).toContain('data.preferredMode')
    expect(source).toContain('data.availableModes[0]')
  })

  it('shows review provenance without enabling execution', () => {
    expect(source).toContain('Reviewed by {capabilityResponse.reviewed.reviewer}')
    expect(source).not.toContain('window.open(')
    expect(source).not.toContain('browser.launch')
  })
})
