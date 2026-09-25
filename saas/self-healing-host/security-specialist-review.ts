// saas/self-healing-host/security-specialist-review.ts
// Optional deep-security review seam for Self-Healing. The Supervisor remains the operational owner;
// this delegates only advisory analysis through the existing governed A2A specialist mesh.

import { getCOSA2ARuntimeHost } from '@/a2a-host/cos-runtime-host'
import type { SupervisorIncident } from '@/lib/supervisor/incident-schema'
import type { CosEvidencePacket } from '@/lib/ai/cos/evidenceCompaction'
import { SIGNALBOOST_SUPERVISOR_CONNECTOR_TENANT } from './signalboost-supervisor-connectors.ts'

export type SelfHealingSecuritySpecialistReview = Readonly<{
  securitySignal: boolean
  attempted: boolean
  ok: boolean
  mode: string
  selectedAgentId?: string
  findingCodes: readonly string[]
}>

function findingCodes(packet: CosEvidencePacket): string[] {
  return [...new Set(packet.items.flatMap(item => item.security.findings.map(finding => finding.code)))].sort()
}

export async function requestSelfHealingSecuritySpecialistReview(input: {
  incident: SupervisorIncident
  evidence: CosEvidencePacket
}): Promise<SelfHealingSecuritySpecialistReview | null> {
  const codes = findingCodes(input.evidence)
  if (!codes.length) return null

  const host = getCOSA2ARuntimeHost()
  if (!host) {
    return Object.freeze({
      securitySignal: true,
      attempted: false,
      ok: false,
      mode: 'specialist_host_unavailable',
      findingCodes: Object.freeze(codes),
    })
  }

  // Never forward the raw suspicious text. The specialist receives gateway findings plus the
  // already-normalized incident identity/evidence summaries. This prevents "security review"
  // from becoming a second injection path.
  const reviewText = [
    'Review an AI-content security finding observed by the Self-Healing Supervisor.',
    `Incident: ${input.incident.incidentId}`,
    `Provider: ${input.incident.provider}`,
    `Environment: ${input.incident.environment}`,
    `Gateway finding codes: ${codes.join(', ')}`,
    `Incident error code: ${String(input.incident.errorCode || 'unspecified').slice(0, 160)}`,
    'The suspicious connector/tool content itself is intentionally withheld. Review only the host-generated finding codes and normalized incident metadata.',
    'Separate observation from inference. Do not execute or authorize any action.',
  ].join('\n')

  try {
    const result = await host.orchestrator.orchestrate({
      tenantId: SIGNALBOOST_SUPERVISOR_CONNECTOR_TENANT,
      environmentId: input.incident.environment,
      portableId: 'self-healing-supervisor',
      messageId: `${input.incident.incidentId}:ai-security-review`,
      text: reviewText,
      plan: { familyId: 'security', skillId: 'security.verify-ai-content' },
      traceId: input.incident.incidentId,
    })
    return Object.freeze({
      securitySignal: true,
      attempted: true,
      ok: result.ok,
      mode: String(result.mode || (result.ok ? 'completed' : 'specialist_unavailable')),
      selectedAgentId: result.selectedAgentId,
      findingCodes: Object.freeze(codes),
    })
  } catch (error) {
    return Object.freeze({
      securitySignal: true,
      attempted: true,
      ok: false,
      mode: `specialist_review_error:${error instanceof Error ? error.message.slice(0, 160) : 'unknown'}`,
      findingCodes: Object.freeze(codes),
    })
  }
}
