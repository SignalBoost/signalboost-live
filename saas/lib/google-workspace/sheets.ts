// Read-only Google Sheets/Drive metadata client. All Google calls use fixed first-party hosts.

import { getValidGoogleWorkspaceToken } from './token-store.ts'

const SHEETS_API = 'https://sheets.googleapis.com/v4'
const DRIVE_API = 'https://www.googleapis.com/drive/v3'
const SPREADSHEET_MIME = 'application/vnd.google-apps.spreadsheet'

function boundedText(value: unknown, max = 240): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

export function extractGoogleSpreadsheetId(value: string): string | null {
  const raw = String(value || '').trim()
  if (/^[A-Za-z0-9_-]{10,200}$/.test(raw)) return raw
  try {
    const url = new URL(raw)
    if (url.hostname !== 'docs.google.com') return null
    const match = url.pathname.match(/^\/spreadsheets\/d\/([A-Za-z0-9_-]{10,200})(?:\/|$)/)
    return match?.[1] || null
  } catch {
    return null
  }
}

function sanitizeRange(value: string): string {
  return String(value || '').trim().slice(0, 250)
}

async function googleJson(userId: string, url: string, fetchImpl: typeof fetch = fetch): Promise<{ ok: true; data: any } | { ok: false; reason: string }> {
  const token = await getValidGoogleWorkspaceToken(userId)
  if ('reason' in token) return { ok: false, reason: token.reason }
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

export type GoogleDriveAccount = {
  displayName: string
  emailAddress: string
  permissionId: string
}

export async function getGoogleDriveAccount(userId: string) {
  const fields = 'user(displayName,emailAddress,permissionId)'
  const result = await googleJson(userId, `${DRIVE_API}/about?fields=${encodeURIComponent(fields)}`)
  if ('reason' in result) return result
  return {
    ok: true as const,
    account: {
      displayName: boundedText(result.data?.user?.displayName, 200),
      emailAddress: boundedText(result.data?.user?.emailAddress, 320),
      permissionId: boundedText(result.data?.user?.permissionId, 200),
    } satisfies GoogleDriveAccount,
  }
}

export type GoogleSpreadsheetListItem = {
  id: string
  name: string
  modifiedTime: string | null
  webViewLink: string | null
}

function mapSpreadsheetFiles(files: any[], limit: number, search: string): GoogleSpreadsheetListItem[] {
  const lowerSearch = search.toLowerCase()
  return files
    .filter((file: any) => file?.mimeType === SPREADSHEET_MIME && file?.trashed !== true)
    .filter((file: any) => !lowerSearch || boundedText(file?.name, 300).toLowerCase().includes(lowerSearch))
    .slice(0, limit)
    .map((file: any): GoogleSpreadsheetListItem => ({
      id: boundedText(file?.id, 200),
      name: boundedText(file?.name, 300),
      modifiedTime: file?.modifiedTime ? String(file.modifiedTime) : null,
      webViewLink: file?.webViewLink ? String(file.webViewLink) : null,
    }))
}

function driveListParams(limit: number) {
  return {
    pageSize: String(limit),
    orderBy: 'modifiedTime desc',
    spaces: 'drive',
    corpora: 'user',
    includeItemsFromAllDrives: 'true',
    supportsAllDrives: 'true',
    fields: 'files(id,name,mimeType,modifiedTime,webViewLink,trashed)',
  }
}

export async function listGoogleSpreadsheets(userId: string, options: { query?: string; limit?: number } = {}) {
  const limit = Math.max(1, Math.min(100, Math.floor(options.limit ?? 25)))
  const search = boundedText(options.query || '', 100)
  const escapedSearch = search.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
  const clauses = [`mimeType = '${SPREADSHEET_MIME}'`, 'trashed = false']
  if (escapedSearch) clauses.push(`name contains '${escapedSearch}'`)

  const primaryParams = new URLSearchParams({
    ...driveListParams(limit),
    q: clauses.join(' and '),
  })
  const primary = await googleJson(userId, `${DRIVE_API}/files?${primaryParams.toString()}`)
  if ('reason' in primary) return primary

  let discoveryMode: 'filtered-query' | 'broad-fallback' = 'filtered-query'
  let files = Array.isArray(primary.data?.files) ? primary.data.files : []
  let spreadsheets = mapSpreadsheetFiles(files, limit, search)

  // If Google's filtered query yields no files, do one bounded broad metadata scan and
  // filter locally. This preserves read-only behavior while recovering from query/provider
  // edge cases and gives the user a usable connector instead of a silent empty dropdown.
  if (spreadsheets.length === 0) {
    const fallbackParams = new URLSearchParams(driveListParams(100))
    const fallback = await googleJson(userId, `${DRIVE_API}/files?${fallbackParams.toString()}`)
    if ('reason' in fallback) return fallback
    discoveryMode = 'broad-fallback'
    files = Array.isArray(fallback.data?.files) ? fallback.data.files : []
    spreadsheets = mapSpreadsheetFiles(files, limit, search)
  }

  const accountResult = await getGoogleDriveAccount(userId)
  return {
    ok: true as const,
    spreadsheets,
    discoveryMode,
    account: 'reason' in accountResult ? null : accountResult.account,
  }
}

export async function getGoogleSpreadsheetMetadata(userId: string, spreadsheetReference: string) {
  const id = extractGoogleSpreadsheetId(spreadsheetReference)
  if (!id) return { ok: false as const, reason: 'invalid_spreadsheet_id_or_url' }
  const fields = 'spreadsheetId,properties(title,locale,timeZone),sheets(properties(sheetId,title,index,gridProperties(rowCount,columnCount)))'
  const result = await googleJson(userId, `${SHEETS_API}/spreadsheets/${encodeURIComponent(id)}?fields=${encodeURIComponent(fields)}`)
  if ('reason' in result) return result
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
  spreadsheetReference: string,
  range: string,
  options: { maxRows?: number; maxColumns?: number } = {},
) {
  const id = extractGoogleSpreadsheetId(spreadsheetReference)
  const safeRange = sanitizeRange(range)
  if (!id) return { ok: false as const, reason: 'invalid_spreadsheet_id_or_url' }
  if (!safeRange) return { ok: false as const, reason: 'range_required' }
  const maxRows = Math.max(1, Math.min(500, Math.floor(options.maxRows ?? 200)))
  const maxColumns = Math.max(1, Math.min(100, Math.floor(options.maxColumns ?? 50)))
  const params = new URLSearchParams({
    majorDimension: 'ROWS',
    valueRenderOption: 'FORMATTED_VALUE',
    dateTimeRenderOption: 'FORMATTED_STRING',
  })
  const result = await googleJson(userId, `${SHEETS_API}/spreadsheets/${encodeURIComponent(id)}/values/${encodeURIComponent(safeRange)}?${params.toString()}`)
  if ('reason' in result) return result
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
  spreadsheetReference: string,
  range: string,
  query: string,
  options: { limit?: number; maxRows?: number } = {},
) {
  const term = boundedText(query, 200).toLowerCase()
  if (!term) return { ok: false as const, reason: 'query_required' }
  const limit = Math.max(1, Math.min(50, Math.floor(options.limit ?? 20)))
  const read = await readGoogleSheetRange(userId, spreadsheetReference, range, { maxRows: options.maxRows ?? 500, maxColumns: 100 })
  if ('reason' in read) return read
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
