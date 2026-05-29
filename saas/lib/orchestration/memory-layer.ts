import type { OrchestrationMemory, OrchestrationRequest } from './types'

const memoryStore = new Map<string, OrchestrationMemory>()

function keyFor(userId?: string) {
  return userId || 'anonymous-session'
}

export function getOrchestrationMemory(request: OrchestrationRequest): OrchestrationMemory {
  const existing = memoryStore.get(keyFor(request.userId))
  return {
    language: request.language || existing?.language || 'en',
    tone: request.tone || existing?.tone || 'friendly',
    brand: request.brand || existing?.brand,
    projectContext: { ...(existing?.projectContext || {}), ...(request.projectContext || {}) },
    lastActions: existing?.lastActions || [],
  }
}

export function rememberOrchestrationAction(request: OrchestrationRequest, action: string) {
  const memory = getOrchestrationMemory(request)
  memory.lastActions = [action, ...memory.lastActions].slice(0, 10)
  memoryStore.set(keyFor(request.userId), memory)
  return memory
}
