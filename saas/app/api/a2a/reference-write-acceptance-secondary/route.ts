import { randomUUID } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { getAdminSupabase } from '@/utils/supabase/server'
import {
  SECONDARY_REFERENCE_WRITE_ACCEPTANCE_AGENT_ID,
  REFERENCE_WRITE_ACCEPTANCE_SKILL_ID,
  applyReferenceWriteAcceptanceEffect,
  parseReferenceWriteRecoveryEnvelope,
  referenceWriteAcceptanceAgentCard,
  referenceWriteAcceptanceIdempotencyKey,
} from '@/a2a-host/reference-write-acceptance'
import {
  SPECIALIST_MESH_WRITE_ACCEPTANCE_CONTROL_HEADER,
  verifySpecialistMeshWriteAcceptanceControlToken,
} from '@/a2a-host/specialist-mesh-write-acceptance-control'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function jsonRpcError(id: unknown, code: number, message: string, status = 400) {
  return NextResponse.json({ jsonrpc: '2.0', id: id ?? null, error: { code, message } }, { status, headers: { 'cache-control': 'no-store' } })
}

export async function GET() {
  try {
    return NextResponse.json(referenceWriteAcceptanceAgentCard(SECONDARY_REFERENCE_WRITE_ACCEPTANCE_AGENT_ID), { headers: { 'cache-control': 'no-store' } })
  } catch {
    return NextResponse.json({ error: 'a2a_reference_origin_unconfigured' }, { status: 503, headers: { 'cache-control': 'no-store' } })
  }
}

export async function POST(request: NextRequest) {
  let body: any
  try { body = await request.json() } catch { return jsonRpcError(null, -32700, 'Parse error') }
  const id = body?.id
  if (body?.jsonrpc !== '2.0' || body?.method !== 'message/send') return jsonRpcError(id, -32600, 'Invalid Request')
  const message = body?.params?.message
  if (!message || message.kind !== 'message' || message.role !== 'user' || !Array.isArray(message.parts)) return jsonRpcError(id, -32602, 'Invalid params')
  const skillId = String(message?.metadata?.signalboostSkillId ?? '').trim()
  if (skillId !== REFERENCE_WRITE_ACCEPTANCE_SKILL_ID) return jsonRpcError(id, -32602, 'Unsupported skill')
  const taskId = String(message?.taskId ?? '').trim()
  if (!taskId) return jsonRpcError(id, -32602, 'Task id required')

  let envelope
  try {
    envelope = parseReferenceWriteRecoveryEnvelope(message?.metadata?.signalboostMeshWriteRecovery)
    if (envelope.idempotencyKey !== referenceWriteAcceptanceIdempotencyKey(envelope.operationKey)) {
      return jsonRpcError(id, -32602, 'Idempotency key mismatch')
    }
  } catch (error) {
    return jsonRpcError(id, -32602, error instanceof Error ? error.message : 'Recovery envelope invalid')
  }

  const control = verifySpecialistMeshWriteAcceptanceControlToken({
    token: request.headers.get(SPECIALIST_MESH_WRITE_ACCEPTANCE_CONTROL_HEADER),
    agentId: SECONDARY_REFERENCE_WRITE_ACCEPTANCE_AGENT_ID,
    taskId,
    operationKey: envelope.operationKey,
  })
  if (!control.valid) return jsonRpcError(id, -32003, 'Write acceptance control required', 403)
  if (control.mode === 'before_apply_unavailable') {
    return NextResponse.json({ error: 'specialist_mesh_write_acceptance_controlled_pre_apply_unavailability' }, { status: 503, headers: { 'cache-control': 'no-store' } })
  }

  try {
    const text = message.parts.filter((part: any) => part?.kind === 'text').map((part: any) => String(part.text ?? '')).join('\n').trim()
    const effect = await applyReferenceWriteAcceptanceEffect({
      db: getAdminSupabase(),
      agentId: SECONDARY_REFERENCE_WRITE_ACCEPTANCE_AGENT_ID,
      envelope,
      text,
    })
    if (control.mode === 'after_apply_unavailable') {
      return NextResponse.json({ error: 'specialist_mesh_write_acceptance_controlled_post_apply_unavailability' }, { status: 503, headers: { 'cache-control': 'no-store' } })
    }
    const contextId = String(message.contextId || '').trim() || `reference-write-context-${randomUUID()}`
    const remoteTaskId = `reference-write-${randomUUID()}`
    return NextResponse.json({
      jsonrpc: '2.0',
      id,
      result: {
        kind: 'task',
        id: remoteTaskId,
        contextId,
        status: { state: 'completed' },
        artifacts: [{ artifactId: `${remoteTaskId}-effect`, parts: [{ kind: 'text', text: JSON.stringify({
          referenceAcceptanceOnly: true,
          providerId: envelope.providerId,
          operationKey: effect.operationKey,
          idempotencyKey: effect.idempotencyKey,
          appliedByAgent: effect.appliedByAgent,
          payloadDigest: effect.payloadDigest,
        }) }] }],
      },
    }, { headers: { 'cache-control': 'no-store' } })
  } catch (error) {
    return jsonRpcError(id, -32602, error instanceof Error ? error.message : 'Reference write acceptance failed')
  }
}
