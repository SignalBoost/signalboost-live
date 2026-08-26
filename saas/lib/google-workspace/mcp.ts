// Governed MCP catalog + execution port for read-only Google Sheets access.
// Any LangChain or other MCP client can call these tools through the existing Agent Gateway.

import type { AllowlistEntry, ExecutionPort, AgentRequest } from '@/agent-gateway/types.ts'
import type { McpToolDefinition } from '@/agent-gateway/mcp-server.ts'
import {
  getGoogleSpreadsheetMetadata,
  listGoogleSpreadsheets,
  readGoogleSheetRange,
  searchGoogleSheetRows,
} from './sheets.ts'

export const GOOGLE_SHEETS_MCP_TOOLS: readonly McpToolDefinition[] = [
  {
    name: 'google_sheets.list_spreadsheets',
    description: 'List spreadsheets visible to the connected Google account. Read-only.',
    actionKind: 'read',
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string' }, limit: { type: 'integer', minimum: 1, maximum: 100 } },
    },
  },
  {
    name: 'google_sheets.get_metadata',
    description: 'Read spreadsheet and tab metadata by spreadsheet ID. Read-only.',
    actionKind: 'read',
    inputSchema: {
      type: 'object',
      properties: { spreadsheetId: { type: 'string' } },
      required: ['spreadsheetId'],
    },
  },
  {
    name: 'google_sheets.read_range',
    description: 'Read a bounded A1 range from a spreadsheet. Read-only.',
    actionKind: 'read',
    inputSchema: {
      type: 'object',
      properties: {
        spreadsheetId: { type: 'string' },
        range: { type: 'string' },
        maxRows: { type: 'integer', minimum: 1, maximum: 500 },
      },
      required: ['spreadsheetId', 'range'],
    },
  },
  {
    name: 'google_sheets.search_rows',
    description: 'Search a bounded spreadsheet range for rows containing a term. Read-only.',
    actionKind: 'read',
    inputSchema: {
      type: 'object',
      properties: {
        spreadsheetId: { type: 'string' },
        range: { type: 'string' },
        query: { type: 'string' },
        limit: { type: 'integer', minimum: 1, maximum: 50 },
      },
      required: ['spreadsheetId', 'range', 'query'],
    },
  },
]

export const GOOGLE_SHEETS_MCP_ALLOWLIST: readonly AllowlistEntry[] = GOOGLE_SHEETS_MCP_TOOLS.map(tool => ({
  actionKind: 'read',
  target: tool.name,
  rollback: 'Read-only operation; no external mutation occurs.',
}))

function userIdFor(request: AgentRequest): string | null {
  const userId = String(request.actor?.userId || '').trim()
  return userId || null
}

export function createGoogleSheetsExecutionPort(): ExecutionPort {
  return {
    async perform(request: AgentRequest) {
      const userId = userIdFor(request)
      if (!userId) return { ok: false, error: 'verified_user_identity_required' }
      const params = request.action.params || {}
      try {
        switch (request.action.target) {
          case 'google_sheets.list_spreadsheets':
            return { ok: true, result: await listGoogleSpreadsheets(userId, {
              query: typeof params.query === 'string' ? params.query : undefined,
              limit: typeof params.limit === 'number' ? params.limit : undefined,
            }) }
          case 'google_sheets.get_metadata':
            return { ok: true, result: await getGoogleSpreadsheetMetadata(userId, String(params.spreadsheetId || '')) }
          case 'google_sheets.read_range':
            return { ok: true, result: await readGoogleSheetRange(
              userId,
              String(params.spreadsheetId || ''),
              String(params.range || ''),
              { maxRows: typeof params.maxRows === 'number' ? params.maxRows : undefined },
            ) }
          case 'google_sheets.search_rows':
            return { ok: true, result: await searchGoogleSheetRows(
              userId,
              String(params.spreadsheetId || ''),
              String(params.range || ''),
              String(params.query || ''),
              { limit: typeof params.limit === 'number' ? params.limit : undefined },
            ) }
          default:
            return { ok: false, error: 'unsupported_google_sheets_tool' }
        }
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) }
      }
    },
  }
}
