export interface IsolationProbe {
  readonly probeId: string
  readonly sourceTenant: string
  readonly targetTenant: string
  readonly blocked: boolean
  readonly leakedFields: readonly string[]
}

export function evaluateTenantIsolation(probes: readonly IsolationProbe[]) {
  if (!probes.length) return Object.freeze({ pass: false, reasons: Object.freeze(['no_isolation_probes']) })
  const reasons: string[] = []
  const ids = new Set<string>()
  for (const probe of probes) {
    if (!probe.probeId || ids.has(probe.probeId)) throw new Error('invalid_isolation_probe')
    ids.add(probe.probeId)
    if (probe.sourceTenant === probe.targetTenant) continue
    if (!probe.blocked) reasons.push(`cross_tenant_probe_not_blocked:${probe.probeId}`)
    if (probe.leakedFields.length) reasons.push(`cross_tenant_data_leak:${probe.probeId}`)
  }
  return Object.freeze({ pass: reasons.length === 0, reasons: Object.freeze(reasons.sort()) })
}
