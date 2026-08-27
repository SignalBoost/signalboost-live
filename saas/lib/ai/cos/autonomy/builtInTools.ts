import { getExternalInfo, formatExternalInfoForAI } from '@/lib/ai/tools/getExternalInfo'
import { getBusinessMetrics, formatMetricsForAI } from '@/lib/ai/tools/getBusinessMetrics'
import { listRepoFiles, readRepoFile, formatFileListForAI, formatFileForAI } from '@/lib/ai/tools/repoReader'
import { loadUserMemories, formatMemoriesForAI } from '@/lib/ai/tools/userMemoryStore'
import {
  getGoogleSpreadsheetMetadata,
  listGoogleSpreadsheets,
  readGoogleSheetRange,
  searchGoogleSheetRows,
} from '@/lib/google-workspace/sheets'
import { CosCognitiveToolRegistry } from './cognitiveTools'

export interface BuiltInCosToolOptions {
  userId?: string
}

function googleToolResult(result: { ok: boolean; reason?: string; [key: string]: unknown }) {
  if ('reason' in result) return { ok: false as const, error: String(result.reason || 'google_sheets_request_failed') }
  return { ok: true as const, output: JSON.stringify(result) }
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

  registry.register({
    toolId: 'google_sheets.list_spreadsheets',
    description: 'List spreadsheets visible to the current user through their connected Google Workspace account. Read-only.',
    risk: 'read_only',
    inputSchema: { type: 'object', properties: { query: { type: 'string' }, limit: { type: 'number' } } },
    async execute(input) {
      if (!options.userId) return { ok: false, error: 'user_id_not_configured' }
      return googleToolResult(await listGoogleSpreadsheets(options.userId, {
        query: typeof input.query === 'string' ? input.query : undefined,
        limit: typeof input.limit === 'number' ? input.limit : undefined,
      }))
    },
  })

  registry.register({
    toolId: 'google_sheets.get_metadata',
    description: 'Read spreadsheet and tab metadata from the current user\'s connected Google account. Read-only.',
    risk: 'read_only',
    inputSchema: { type: 'object', properties: { spreadsheetId: { type: 'string' } }, required: ['spreadsheetId'] },
    async execute(input) {
      if (!options.userId) return { ok: false, error: 'user_id_not_configured' }
      return googleToolResult(await getGoogleSpreadsheetMetadata(options.userId, String(input.spreadsheetId || '')))
    },
  })

  registry.register({
    toolId: 'google_sheets.read_range',
    description: 'Read a bounded A1 range from the current user\'s connected Google Sheet. Read-only.',
    risk: 'read_only',
    inputSchema: {
      type: 'object',
      properties: { spreadsheetId: { type: 'string' }, range: { type: 'string' }, maxRows: { type: 'number' } },
      required: ['spreadsheetId', 'range'],
    },
    async execute(input) {
      if (!options.userId) return { ok: false, error: 'user_id_not_configured' }
      return googleToolResult(await readGoogleSheetRange(
        options.userId,
        String(input.spreadsheetId || ''),
        String(input.range || ''),
        { maxRows: typeof input.maxRows === 'number' ? input.maxRows : undefined },
      ))
    },
  })

  registry.register({
    toolId: 'google_sheets.search_rows',
    description: 'Search a bounded A1 range in the current user\'s connected Google Sheet and return matching rows. Read-only.',
    risk: 'read_only',
    inputSchema: {
      type: 'object',
      properties: {
        spreadsheetId: { type: 'string' },
        range: { type: 'string' },
        query: { type: 'string' },
        limit: { type: 'number' },
      },
      required: ['spreadsheetId', 'range', 'query'],
    },
    async execute(input) {
      if (!options.userId) return { ok: false, error: 'user_id_not_configured' }
      return googleToolResult(await searchGoogleSheetRows(
        options.userId,
        String(input.spreadsheetId || ''),
        String(input.range || ''),
        String(input.query || ''),
        { limit: typeof input.limit === 'number' ? input.limit : undefined },
      ))
    },
  })

  return registry
}
