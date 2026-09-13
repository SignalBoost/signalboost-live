import { randomUUID } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { resolveReferenceA2AOrigin } from '@/a2a-host/reference-a2a-config'
import {
  SECONDARY_REFERENCE_DIAGNOSTIC_AGENT_ID,
  SECONDARY_REFERENCE_DIAGNOSTIC_SKILL_ID,
  secondaryReferenceDiagnosticArtifactText,
} from '@/a2a-host/reference-secondary-diagnostic'
import {
  SPECIALIST_MESH_ACCEPTANCE_FAILURE_HEADER,
  isValidSpecialistMeshAcceptanceFailureToken,
} from '@/a2a-host/specialist-mesh-acceptance-control'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function endpoint(): string {
  return new URL('/api/a2a/reference-diagnostic-secondary', resolveReferenceA2AOrigin()).toString()
}

function agentCard() {
  return Object.freeze({
    protocolVersion: '0.3.0',
    name: 'SignalBoost Reference Self-Healing Verification Diagnostic Specialist',
    description: 'Independent read-only reference A2A specialist that verifies incident classification and bounded diagnostic next steps.',
    url: endpoint(),
    preferredTransport: 'JSONRPC',
    version: '1.0.0',
    capabilities: Object.freeze({ streaming: false, pushNotifications: false }),
    defaultInputModes: Object.freeze(['text/plain']),
    defaultOutputModes: Object.freeze(['application/json']),
    skills: Object.freeze([Object.freeze({
      id: SECONDARY_REFERENCE_DIAGNOSTIC_SKILL_ID,
      name: 'Verify incident diagnosis',
      description: 'Independently classify supplied incident evidence and recommend bounded next diagnostic checks without mutating systems.',
      tags: Object.freeze(['self-healing', 'diagnostic', 'verification', 'advisory', 'reference']),
      inputModes: Object.freeze(['text/plain']),
      outputModes: Object.freeze(['application/json']),
    })]),
  })
}

function jsonRpcError(id: unknown, code: number, message: string, status = 400) {
  return NextResponse.json({ jsonrpc: '2.0', id: id ?? null, error: { code, message } }, { status })
}

export async function GET() {
  try { return NextResponse.json(agentCard(), { headers: { 'cache-control': 'no-store' } }) }
  catch { return NextResponse.json({ error: 'a2a_reference_origin_unconfigured' }, { status: 503, headers: { 'cache-control': 'no-store' } }) }
}

export async function POST(request: NextRequest) {
  if (isValidSpecialistMeshAcceptanceFailureToken({
    token: request.headers.get(SPECIALIST_MESH_ACCEPTANCE_FAILURE_HEADER),
    agentId: SECONDARY_REFERENCE_DIAGNOSTIC_AGENT_ID,
  })) {
    return NextResponse.json({ error: 'specialist_mesh_acceptance_controlled_unavailability' }, { status: 503, headers: { 'cache-control': 'no-store' } })
  }

  let body: any
  try { body = await request.json() } catch { return jsonRpcError(null, -32700, 'Parse error') }
  const id = body?.id
  if (body?.jsonrpc !== '2.0') return jsonRpcError(id, -32600, 'Invalid Request')
  if (body?.method === 'tasks/get' || body?.method === 'tasks/cancel') return jsonRpcError(id, -32001, 'Task not found')
  if (body?.method !== 'message/send') return jsonRpcError(id, -32601, 'Method not found')
  const message = body?.params?.message
  if (!message || message.kind !== 'message' || message.role !== 'user' || !Array.isArray(message.parts)) return jsonRpcError(id, -32602, 'Invalid params')
  const skillId = String(message?.metadata?.signalboostSkillId ?? '').trim()
  if (skillId !== SECONDARY_REFERENCE_DIAGNOSTIC_SKILL_ID) return jsonRpcError(id, -32602, 'Unsupported skill')
  const text = message.parts.filter((part: any) => part?.kind === 'text').map((part: any) => String(part.text ?? '')).join('\n').trim()

  try {
    const artifact = secondaryReferenceDiagnosticArtifactText(text)
    const contextId = String(message.contextId || '').trim() || `secondary-reference-context-${randomUUID()}`
    const taskId = `secondary-reference-diagnostic-${randomUUID()}`
    return NextResponse.json({
      jsonrpc: '2.0', id,
      result: {
        kind: 'task', id: taskId, contextId,
        status: { state: 'completed' },
        artifacts: [{ artifactId: `${taskId}-analysis`, parts: [{ kind: 'text', text: artifact }] }],
      },
    }, { headers: { 'cache-control': 'no-store' } })
  } catch (error) {
    return jsonRpcError(id, -32602, error instanceof Error ? error.message : 'Invalid diagnostic input')
  }
}
