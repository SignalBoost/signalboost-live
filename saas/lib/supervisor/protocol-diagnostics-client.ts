export const PROTOCOL_DIAGNOSTICS_SCHEMA_VERSION = 'protocol-capability-diagnostics-v1' as const

export type ProtocolDiagnosticsSnapshot = {
  generatedAt: string
  summary: {
    protocols: number
    mutatingProtocols: number
    supervisoryOnlyProtocols: number
    safetyClassifiedProtocols: number
  }
  protocols: Array<{
    protocolId: string
    version: string
    domain: string
    operations: string[]
    mutating: boolean
    safetyHints: string[]
    evidence: string[]
    supervisoryOnly: boolean
  }>
  safety: {
    readOnly: true
    executionControlsExposed: false
    mutationControlsExposed: false
  }
  schemaVersion: typeof PROTOCOL_DIAGNOSTICS_SCHEMA_VERSION
}

const isFiniteCount = (value: unknown) => Number.isInteger(value) && Number(value) >= 0

export function validateProtocolDiagnosticsSnapshot(value: unknown): ProtocolDiagnosticsSnapshot | null {
  if (!value || typeof value !== 'object') return null
  const snapshot = value as Record<string, unknown>
  const summary = snapshot.summary as Record<string, unknown> | undefined
  const safety = snapshot.safety as Record<string, unknown> | undefined
  const protocols = snapshot.protocols

  if (snapshot.schemaVersion !== PROTOCOL_DIAGNOSTICS_SCHEMA_VERSION) return null
  if (typeof snapshot.generatedAt !== 'string' || !Number.isFinite(Date.parse(snapshot.generatedAt))) return null
  if (!summary || !safety || !Array.isArray(protocols)) return null
  if (![summary.protocols, summary.mutatingProtocols, summary.supervisoryOnlyProtocols, summary.safetyClassifiedProtocols].every(isFiniteCount)) return null
  if (summary.protocols !== protocols.length) return null
  if (safety.readOnly !== true || safety.executionControlsExposed !== false || safety.mutationControlsExposed !== false) return null

  const validProtocols = protocols.every(protocol => {
    if (!protocol || typeof protocol !== 'object') return false
    const item = protocol as Record<string, unknown>
    return typeof item.protocolId === 'string' && item.protocolId.length > 0
      && typeof item.version === 'string' && item.version.length > 0
      && typeof item.domain === 'string'
      && Array.isArray(item.operations) && item.operations.length > 0
      && Array.isArray(item.evidence) && item.evidence.length > 0
      && Array.isArray(item.safetyHints)
      && typeof item.mutating === 'boolean'
      && typeof item.supervisoryOnly === 'boolean'
  })

  return validProtocols ? value as ProtocolDiagnosticsSnapshot : null
}
