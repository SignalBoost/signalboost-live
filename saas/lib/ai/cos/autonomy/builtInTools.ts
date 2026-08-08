import { getExternalInfo, formatExternalInfoForAI } from '@/lib/ai/tools/getExternalInfo'
import { getBusinessMetrics, formatMetricsForAI } from '@/lib/ai/tools/getBusinessMetrics'
import { listRepoFiles, readRepoFile, formatFileListForAI, formatFileForAI } from '@/lib/ai/tools/repoReader'
import { loadUserMemories, formatMemoriesForAI } from '@/lib/ai/tools/userMemoryStore'
import { CosCognitiveToolRegistry } from './cognitiveTools'

export interface BuiltInCosToolOptions {
  userId?: string
}

export function createBuiltInCosCognitiveTools(options: BuiltInCosToolOptions = {}): CosCognitiveToolRegistry {
  const registry = new CosCognitiveToolRegistry()

  registry.register({
    toolId: 'web.search',
    description: 'Search current public information. Use for facts that may have changed or information not present in local knowledge.',
    risk: 'read_only',
    inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
    async execute(input) {
      const query = String(input.query || '').trim()
      if (!query) return { ok: false, error: 'query_required' }
      const result = await getExternalInfo(query)
      return result.ok
        ? { ok: true, output: formatExternalInfoForAI(query, result.results) }
        : { ok: false, error: result.error || 'web_search_failed' }
    },
  })

  registry.register({
    toolId: 'repo.list',
    description: 'List files in the SignalBoost repository, optionally under a path prefix.',
    risk: 'read_only',
    inputSchema: { type: 'object', properties: { prefix: { type: 'string' } } },
    async execute(input) {
      const prefix = typeof input.prefix === 'string' ? input.prefix : undefined
      const result = await listRepoFiles(prefix)
      return result.ok
        ? { ok: true, output: formatFileListForAI(prefix, result.files) }
        : { ok: false, error: result.error || 'repo_list_failed' }
    },
  })

  registry.register({
    toolId: 'repo.read',
    description: 'Read one repository file by exact path. Read-only.',
    risk: 'read_only',
    inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
    async execute(input) {
      const path = String(input.path || '').trim()
      if (!path) return { ok: false, error: 'path_required' }
      const result = await readRepoFile(path)
      return result.ok
        ? { ok: true, output: formatFileForAI(path, result.content, result.truncated) }
        : { ok: false, error: result.error || 'repo_read_failed' }
    },
  })

  registry.register({
    toolId: 'business.metrics',
    description: 'Read current SignalBoost business metrics from the internal metrics source.',
    risk: 'read_only',
    inputSchema: { type: 'object', properties: {} },
    async execute() {
      const result = await getBusinessMetrics()
      return result.ok && result.metrics
        ? { ok: true, output: formatMetricsForAI(result.metrics) }
        : { ok: false, error: result.error || 'metrics_failed' }
    },
  })

  registry.register({
    toolId: 'memory.read',
    description: 'Read durable user/owner memories available to COS.',
    risk: 'read_only',
    inputSchema: { type: 'object', properties: {} },
    async execute() {
      if (!options.userId) return { ok: false, error: 'user_id_not_configured' }
      const memories = await loadUserMemories(options.userId)
      return { ok: true, output: formatMemoriesForAI(memories) || 'No saved memories.' }
    },
  })

  return registry
}
