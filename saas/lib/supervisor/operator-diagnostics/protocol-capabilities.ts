import type { ProtocolCapabilityMetadata } from '../../../agent-gateway/types.ts'

export const PROTOCOL_CAPABILITY_DIAGNOSTICS_SCHEMA_VERSION = 'protocol-capability-diagnostics-v1' as const

export interface ProtocolCapabilityDiagnosticsSnapshot {
  generatedAt: string
  summary: {
    protocols: number
    mutatingProtocols: number
    supervisoryOnlyProtocols: number
    safetyClassifiedProtocols: number
  }
  protocols: readonly {
    protocolId: string
    version: string
    domain: ProtocolCapabilityMetadata['domain']
    operations: readonly ProtocolCapabilityMetadata['operations'][number][]
    mutating: boolean
    safetyHints: readonly ProtocolCapabilityMetadata['safetyHints'][number][]
    evidence: readonly ProtocolCapabilityMetadata['evidence'][number][]
    supervisoryOnly: boolean
  }[]
  safety: {
    readOnly: true
    executionControlsExposed: false
    mutationControlsExposed: false
  }
  schemaVersion: typeof PROTOCOL_CAPABILITY_DIAGNOSTICS_SCHEMA_VERSION
}

export function createProtocolCapabilityDiagnostics(
  generatedAt: string,
  catalog: Readonly<Record<string, ProtocolCapabilityMetadata>>,
): ProtocolCapabilityDiagnosticsSnapshot {
  if (!Number.isFinite(Date.parse(generatedAt))) {
    throw new Error(`invalid_protocol_capability_diagnostics_timestamp:${generatedAt}`)
  }

  const protocols = Object.entries(catalog)
    .map(([protocolId, metadata]) => {
      if (!metadata.version || metadata.operations.length === 0 || metadata.evidence.length === 0) {
        throw new Error(`incomplete_protocol_capability_metadata:${protocolId}`)
      }
      return {
        protocolId,
        version: metadata.version,
        domain: metadata.domain,
        operations: [...metadata.operations].sort(),
        mutating: metadata.mutating,
        safetyHints: [...metadata.safetyHints].sort(),
        evidence: [...metadata.evidence].sort(),
        supervisoryOnly: metadata.supervisoryOnly === true,
      }
    })
    .sort((a, b) => a.protocolId.localeCompare(b.protocolId))

  return Object.freeze({
    generatedAt,
    summary: {
      protocols: protocols.length,
      mutatingProtocols: protocols.filter(protocol => protocol.mutating).length,
      supervisoryOnlyProtocols: protocols.filter(protocol => protocol.supervisoryOnly).length,
      safetyClassifiedProtocols: protocols.filter(protocol => protocol.safetyHints.includes('safety')).length,
    },
    protocols,
    safety: {
      readOnly: true as const,
      executionControlsExposed: false as const,
      mutationControlsExposed: false as const,
    },
    schemaVersion: PROTOCOL_CAPABILITY_DIAGNOSTICS_SCHEMA_VERSION,
  })
}
