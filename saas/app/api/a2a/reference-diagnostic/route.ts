import { randomUUID } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { referenceDiagnosticAgentCard } from '@/a2a-host/reference-a2a-config'
import {
  REFERENCE_DIAGNOSTIC_SKILL_ID,
  referenceDiagnosticArtifactText,
} from '@/a2a-host/reference-self-healing-diagnostic'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function jsonRpcError(id: unknown, code: number, message: string, status = 400) {
  return NextResponse.json({ jsonrpc: '2.0', id: id ?? null, error: { code, message } }, { status })
}

export async function GET() {
  try {
    return NextResponse.json(referenceDiagnosticAgentCard(), { headers: { 'cache-control': 'no-store' } })
  } catch {
    return NextResponse.json({ error: 'a2a_reference_origin_unconfigured' }, { status: 503, headers: { 'cache-control': 'no-store' } })
  }
}

export async function POST(request: NextRequest) {
  let body: any
  try { body = await request.json() } catch { return jsonRpcError(null, -32700, 'Parse error') }
  const id = body?.id
  if (body?.jsonrpc !== '2.0') return jsonRpcError(id, -32600, 'Invalid Request')
  if (body?.method === 'tasks/get' || body?.method === 'tasks/cancel') return jsonRpcError(id, -32001, 'Task not found')
  if (body?.method !== 'message/send') return jsonRpcError(id, -32601, 'Method not found')
  const message = body?.params?.message
  if (!message || message.kind !== 'message' || message.role !== 'user' || !Array.isArray(message.parts)) {
    return jsonRpcError(id, -32602, 'Invalid params')
  }
  const skillId = String(message?.metadata?.signalboostSkillId ?? '').trim()
  if (skillId !== REFERENCE_DIAGNOSTIC_SKILL_ID) return jsonRpcError(id, -32602, 'Unsupported skill')
  const text = message.parts.filter((part: any) => part?.kind === 'text').map((part: any) => String(part.text ?? '')).join('\n').trim()
  try {
    const artifact = referenceDiagnosticArtifactText(text)
    const contextId = String(message.contextId || '').trim() || `reference-context-${randomUUID()}`
    const taskId = `reference-diagnostic-${randomUUID()}`
    return NextResponse.json({
      jsonrpc: '2.0',
      id,
      result: {
        kind: 'task',
        id: taskId,
        contextId,
        status: { state: 'completed' },
        artifacts: [{ artifactId: `${taskId}-analysis`, parts: [{ kind: 'text', text: artifact }] }],
      },
    }, { headers: { 'cache-control': 'no-store' } })
  } catch (error) {
    return jsonRpcError(id, -32602, error instanceof Error ? error.message : 'Invalid diagnostic input')
  }
}
