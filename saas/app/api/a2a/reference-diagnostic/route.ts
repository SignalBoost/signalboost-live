import { NextRequest, NextResponse } from 'next/server'
import {
  REFERENCE_DIAGNOSTIC_AGENT_ID,
  REFERENCE_DIAGNOSTIC_SKILL_ID,
  referenceDiagnosticArtifactText,
} from '@/a2a-host/reference-self-healing-diagnostic'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function jsonRpcError(id: unknown, code: number, message: string, status = 400) {
  return NextResponse.json({ jsonrpc: '2.0', id: id ?? null, error: { code, message } }, { status })
}

function cardFor(request: NextRequest) {
  const url = new URL('/api/a2a/reference-diagnostic', request.nextUrl.origin).toString()
  return {
    protocolVersion: '0.3.0',
    name: 'SignalBoost Reference Self-Healing Diagnostic Specialist',
    description: 'Read-only reference A2A specialist that classifies incident evidence and recommends bounded next diagnostic checks.',
    url,
    preferredTransport: 'JSONRPC',
    defaultInputModes: ['text/plain'],
    defaultOutputModes: ['application/json'],
    skills: [{
      id: REFERENCE_DIAGNOSTIC_SKILL_ID,
      name: 'Diagnose incident evidence',
      description: 'Classify supplied incident evidence and recommend next diagnostic checks without mutating systems.',
      tags: ['self-healing', 'diagnostic', 'advisory', 'reference'],
      inputModes: ['text/plain'],
      outputModes: ['application/json'],
    }],
  }
}

export async function GET(request: NextRequest) {
  return NextResponse.json(cardFor(request), { headers: { 'cache-control': 'no-store' } })
}

export async function POST(request: NextRequest) {
  let body: any
  try { body = await request.json() } catch { return jsonRpcError(null, -32700, 'Parse error') }
  const id = body?.id
  if (body?.jsonrpc !== '2.0' || body?.method !== 'message/send') return jsonRpcError(id, -32601, 'Method not found')
  const message = body?.params?.message
  if (!message || message.kind !== 'message' || message.role !== 'user' || !Array.isArray(message.parts)) {
    return jsonRpcError(id, -32602, 'Invalid params')
  }
  const skillId = String(message?.metadata?.signalboostSkillId ?? '').trim()
  if (skillId !== REFERENCE_DIAGNOSTIC_SKILL_ID) return jsonRpcError(id, -32602, 'Unsupported skill')
  const text = message.parts.filter((part: any) => part?.kind === 'text').map((part: any) => String(part.text ?? '')).join('\n').trim()
  try {
    const artifact = referenceDiagnosticArtifactText(text)
    const taskId = `reference-diagnostic-${String(message.messageId ?? 'message').replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 80)}`
    return NextResponse.json({
      jsonrpc: '2.0',
      id,
      result: {
        kind: 'task',
        id: taskId,
        contextId: message.contextId,
        status: { state: 'completed' },
        artifacts: [{ artifactId: `${taskId}-analysis`, parts: [{ kind: 'text', text: artifact }] }],
      },
    }, { headers: { 'cache-control': 'no-store' } })
  } catch (error) {
    return jsonRpcError(id, -32602, error instanceof Error ? error.message : 'Invalid diagnostic input')
  }
}
