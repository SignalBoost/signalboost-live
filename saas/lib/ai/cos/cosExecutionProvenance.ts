// saas/lib/ai/cos/cosExecutionProvenance.ts
export type CosExecutionSnapshot = {
  at: string
  prompt: string
  reply: string | null
  source: string
  executionProvenance: Record<string, unknown>
  liveTelemetry?: Record<string, unknown> | null
}

const MAX_SNAPSHOTS = 500
const snapshots = new Map<string, CosExecutionSnapshot>()

function key(sessionId: string | null | undefined, userId: string | null | undefined): string | null {
  const session = String(sessionId || '').trim()
  if (session) return `session:${session}`
  const user = String(userId || '').trim()
  return user ? `user:${user}` : null
}

export function cosConversationKey(body: any, req?: { headers?: { get(name: string): string | null } }): string | null {
  const candidates = [
    body?.context?.conversationId,
    body?.context?.conversation_id,
    body?.context?.sessionId,
    body?.context?.session_id,
    body?.conversationId,
    body?.conversation_id,
    body?.sessionId,
    body?.session_id,
    req?.headers?.get('x-conversation-id'),
    req?.headers?.get('x-session-id'),
  ]
  for (const value of candidates) {
    const normalized = String(value || '').trim()
    if (normalized) return normalized
  }
  return null
}

export function rememberCosExecution(input: {
  sessionId?: string | null
  userId?: string | null
  snapshot: CosExecutionSnapshot
}): void {
  const storageKey = key(input.sessionId, input.userId)
  if (!storageKey) return
  snapshots.delete(storageKey)
  snapshots.set(storageKey, input.snapshot)
  while (snapshots.size > MAX_SNAPSHOTS) snapshots.delete(snapshots.keys().next().value as string)
}

export function previousCosExecution(input: { sessionId?: string | null; userId?: string | null }): CosExecutionSnapshot | null {
  const storageKey = key(input.sessionId, input.userId)
  return storageKey ? snapshots.get(storageKey) ?? null : null
}

export function formatCosExecutionProvenance(snapshot: CosExecutionSnapshot): string {
  const p: any = snapshot.executionProvenance || {}
  const rows = [
    ['Semantic Cache', p.semantic_cache],
    ['Enterprise Memory', p.enterprise_memory],
    ['Knowledge Graph', p.knowledge_graph],
    ['Learned Corpus', p.learned_corpus],
    ['User Memory', p.user_memory],
    ['Autonomous Research', p.autonomous_research],
    ['Local Reasoning Engine', p.local_reasoning],
    ['External Fallback / Teacher', p.external_ai],
  ] as const
  const local = p.local_reasoning || {}
  const primary = local.invoked ? (local.model || 'local reasoning engine') : p.external_ai?.invoked ? (p.external_ai.model || p.external_ai.provider || 'external AI') : snapshot.source
  const lines = [
    `Primary model/source: ${primary}.`,
    `Execution authority: ${p.authority || 'server_execution_telemetry'}; model-generated provenance: ${p.model_generated === true ? 'yes' : 'no'}.`,
  ]
  for (const [name, value] of rows) {
    const used = Boolean(value?.used ?? value?.invoked)
    const evidence = value?.evidence_count ?? value?.documents_acquired ?? 0
    const retained = value?.new_knowledge_retained ?? 0
    lines.push(`- ${name}: ${used ? 'used' : 'not used'}; evidence contributed: ${evidence}; new knowledge retained: ${retained}.`)
  }
  return lines.join('\n')
}
