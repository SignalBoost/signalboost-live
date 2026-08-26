// Read-only Google Sheets/Drive metadata client. All Google calls use fixed first-party hosts.

import { getValidGoogleWorkspaceToken } from './token-store.ts'

const SHEETS_API = 'https://sheets.googleapis.com/v4'
const DRIVE_API = 'https://www.googleapis.com/drive/v3'

function boundedText(value: unknown, max = 240): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function validSpreadsheetId(value: string): boolean {
  return /^[A-Za-z0-9_-]{10,200}$/.test(value)
}

function sanitizeRange(value: string): string {
  return String(value || '').trim().slice(0, 250)
}

async function googleJson(userId: string, url: string, fetchImpl: typeof fetch = fetch): Promise<{ ok: true; data: any } | { ok: false; reason: string }> {
  const token = await getValidGoogleWorkspaceToken(userId)
  if (!token.ok) return { ok: false, reason: token.reason }
  let response: Response
  try {
    response = await fetchImpl(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token.accessToken}`, Accept: 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(12_000),
    })
  } catch (error) {
    return { ok: false, reason: `Google API request failed: ${error instanceof Error ? error.message : String(error)}` }
  }
  const raw = await response.text()
  if (!response.ok) return { ok: false, reason: `Google API request failed (${response.status}): ${raw.slice(0, 200)}` }
  try { return { ok: true, data: JSON.parse(raw) } } catch { return { ok: false, reason: 'Google API returned non-JSON data.' } }
}

export type GoogleSpreadsheetListItem = {
  id: string
  name: string
  modifiedTime: string | null
  webViewLink: string | null
}

export async function listGoogleSpreadsheets(userId: string, options: { query?: string; limit?: number } = {}) {
  const limit = Math.max(1, Math.min(100, Math.floor(options.limit ?? 25)))
  const search = boundedText(options.query || '', 100).replace(/\\/g, '\\\\').replace(/'/g, "\\'")
  const clauses = ["mimeType='application/vnd.google-apps.spreadsheet'", 'trashed=false']
  if (search) clauses.push(`name contains '${search}'`)
  const params = new URLSearchParams({
    q: clauses.join(' and '),
    pageSize: String(limit),
    orderBy: 'modifiedTime desc',
    fields: 'files(id,name,modifiedTime,webViewLink)',
  })
  const result = await googleJson(userId, `${DRIVE_API}/files?${params.toString()}`)
  if (!result.ok) return result
  const files = Array.isArray(result.data?.files) ? result.data.files : []
  return {
    ok: true as const,
    spreadsheets: files.slice(0, limit).map((file: any): GoogleSpreadsheetListItem => ({
      id: boundedText(file?.id, 200),
      name: boundedText(file?.name, 300),
      modifiedTime: file?.modifiedTime ? String(file.modifiedTime) : null,
      webViewLink: file?.webViewLink ? String(file.webViewLink) : null,
    })),
  }
}

export async function getGoogleSpreadsheetMetadata(userId: string, spreadsheetId: string) {
  const id = String(spreadsheetId || '').trim()
  if (!validSpreadsheetId(id)) return { ok: false as const, reason: 'invalid_spreadsheet_id' }
  const fields = 'spreadsheetId,properties(title,locale,timeZone),sheets(properties(sheetId,title,index,gridProperties(rowCount,columnCount)))'
  const result = await googleJson(userId, `${SHEETS_API}/spreadsheets/${encodeURIComponent(id)}?fields=${encodeURIComponent(fields)}`)
  if (!result.ok) return result
  const sheets = Array.isArray(result.data?.sheets) ? result.data.sheets : []
  return {
    ok: true as const,
    spreadsheetId: id,
    title: boundedText(result.data?.properties?.title, 300),
    locale: boundedText(result.data?.properties?.locale, 40),
    timeZone: boundedText(result.data?.properties?.timeZone, 80),
    sheets: sheets.map((sheet: any) => ({
      sheetId: Number(sheet?.properties?.sheetId ?? 0),
      title: boundedText(sheet?.properties?.title, 200),
      index: Number(sheet?.properties?.index ?? 0),
      rowCount: Math.max(0, Number(sheet?.properties?.gridProperties?.rowCount ?? 0)),
      columnCount: Math.max(0, Number(sheet?.properties?.gridProperties?.columnCount ?? 0)),
    })),
  }
}

export async function readGoogleSheetRange(
  userId: string,
  spreadsheetId: string,
  range: string,
  options: { maxRows?: number; maxColumns?: number } = {},
) {
  const id = String(spreadsheetId || '').trim()
  const safeRange = sanitizeRange(range)
  if (!validSpreadsheetId(id)) return { ok: false as const, reason: 'invalid_spreadsheet_id' }
  if (!safeRange) return { ok: false as const, reason: 'range_required' }
  const maxRows = Math.max(1, Math.min(500, Math.floor(options.maxRows ?? 200)))
  const maxColumns = Math.max(1, Math.min(100, Math.floor(options.maxColumns ?? 50)))
  const params = new URLSearchParams({
    majorDimension: 'ROWS',
    valueRenderOption: 'FORMATTED_VALUE',
    dateTimeRenderOption: 'FORMATTED_STRING',
  })
  const result = await googleJson(userId, `${SHEETS_API}/spreadsheets/${encodeURIComponent(id)}/values/${encodeURIComponent(safeRange)}?${params.toString()}`)
  if (!result.ok) return result
  const values = Array.isArray(result.data?.values) ? result.data.values : []
  const rows = values.slice(0, maxRows).map((row: unknown[]) =>
    (Array.isArray(row) ? row : []).slice(0, maxColumns).map(cell => boundedText(cell, 2000)),
  )
  return {
    ok: true as const,
    spreadsheetId: id,
    range: boundedText(result.data?.range || safeRange, 300),
    majorDimension: 'ROWS' as const,
    rows,
    truncated: values.length > maxRows || rows.some((row: string[]) => row.length >= maxColumns),
  }
}

export async function searchGoogleSheetRows(
  userId: string,
  spreadsheetId: string,
  range: string,
  query: string,
  options: { limit?: number; maxRows?: number } = {},
) {
  const term = boundedText(query, 200).toLowerCase()
  if (!term) return { ok: false as const, reason: 'query_required' }
  const limit = Math.max(1, Math.min(50, Math.floor(options.limit ?? 20)))
  const read = await readGoogleSheetRange(userId, spreadsheetId, range, { maxRows: options.maxRows ?? 500, maxColumns: 100 })
  if (!read.ok) return read
  const matches = read.rows.flatMap((row: string[], index: number) =>
    row.some(cell => cell.toLowerCase().includes(term)) ? [{ rowNumber: index + 1, values: row }] : [],
  ).slice(0, limit)
  return {
    ok: true as const,
    spreadsheetId: read.spreadsheetId,
    range: read.range,
    query: boundedText(query, 200),
    matches,
    scannedRows: read.rows.length,
    truncated: read.truncated || matches.length >= limit,
  }
}
