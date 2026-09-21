export const MCP_PROVIDER_CERTIFICATION_VERSION = 'mcp-provider-certification-v1' as const

export interface McpCertificationReadiness {
  readonly providerId: string
  readonly configured: boolean
  readonly reason: string
}

export interface McpCertificationCapability {
  readonly capabilityId: string
}

export interface McpCertificationInvocationResult {
  readonly ok: boolean
  readonly mode?: string
  readonly error?: string
}

export interface McpCertifiableGateway<ServerId extends string> {
  readonly readiness: readonly McpCertificationReadiness[]
  discover(serverId: ServerId): Promise<readonly McpCertificationCapability[]>
  invoke(input: {
    serverId: ServerId
    capabilityId: string
    args: Readonly<Record<string, unknown>>
  }): Promise<McpCertificationInvocationResult>
}

export interface McpCertificationProbe {
  readonly id: string
  readonly capabilityId: string
  readonly args: Readonly<Record<string, unknown>>
  readonly expect: Readonly<{
    ok: boolean
    mode?: string
    errorIncludes?: string
  }>
}

export interface McpProviderCertificationSpec<ServerId extends string> {
  readonly providerId: ServerId
  readonly expectedCapabilities: readonly string[]
  readonly probes?: readonly McpCertificationProbe[]
}

export interface McpCertificationCheck {
  readonly id: string
  readonly passed: boolean
  readonly detail: string
}

export interface McpProviderCertificationReport {
  readonly schemaVersion: typeof MCP_PROVIDER_CERTIFICATION_VERSION
  readonly providerId: string
  readonly passed: boolean
  readonly checks: readonly McpCertificationCheck[]
}

function normalizedCapabilities(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values.map(value => String(value || '').trim()).filter(Boolean))].sort())
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

function check(id: string, passed: boolean, detail: string): McpCertificationCheck {
  return Object.freeze({ id, passed, detail })
}

export async function certifyMcpProvider<ServerId extends string>(
  gateway: McpCertifiableGateway<ServerId>,
  spec: McpProviderCertificationSpec<ServerId>,
): Promise<McpProviderCertificationReport> {
  const checks: McpCertificationCheck[] = []
  const readiness = gateway.readiness.find(item => item.providerId === spec.providerId)
  const ready = readiness?.configured === true
  checks.push(check('readiness', ready, ready ? 'configured=true' : `configured=false;reason=${readiness?.reason || 'missing'}`))

  if (!ready) {
    checks.push(check('exact_projection', false, 'not_run:not_ready'))
    for (const probe of spec.probes ?? []) checks.push(check(`probe:${probe.id}`, false, 'not_run:not_ready'))
    return Object.freeze({
      schemaVersion: MCP_PROVIDER_CERTIFICATION_VERSION,
      providerId: spec.providerId,
      passed: false,
      checks: Object.freeze(checks),
    })
  }

  let discovered: readonly McpCertificationCapability[] = []
  try {
    discovered = await gateway.discover(spec.providerId)
    const expected = normalizedCapabilities(spec.expectedCapabilities)
    const actual = normalizedCapabilities(discovered.map(item => item.capabilityId))
    const missing = expected.filter(item => !actual.includes(item))
    const unexpected = actual.filter(item => !expected.includes(item))
    checks.push(check(
      'exact_projection',
      sameStrings(expected, actual),
      `expected=${expected.length};observed=${actual.length};missing=${missing.length};unexpected=${unexpected.length}`,
    ))
  } catch {
    checks.push(check('exact_projection', false, 'discovery_failed'))
  }

  for (const probe of spec.probes ?? []) {
    try {
      const result = await gateway.invoke({
        serverId: spec.providerId,
        capabilityId: probe.capabilityId,
        args: probe.args,
      })
      const okMatch = result.ok === probe.expect.ok
      const modeMatch = probe.expect.mode === undefined || result.mode === probe.expect.mode
      const errorMatch = probe.expect.errorIncludes === undefined || String(result.error || '').includes(probe.expect.errorIncludes)
      checks.push(check(
        `probe:${probe.id}`,
        okMatch && modeMatch && errorMatch,
        `ok_match=${okMatch};mode_match=${modeMatch};error_match=${errorMatch}`,
      ))
    } catch {
      checks.push(check(`probe:${probe.id}`, false, 'invoke_failed'))
    }
  }

  return Object.freeze({
    schemaVersion: MCP_PROVIDER_CERTIFICATION_VERSION,
    providerId: spec.providerId,
    passed: checks.every(item => item.passed),
    checks: Object.freeze(checks),
  })
}
