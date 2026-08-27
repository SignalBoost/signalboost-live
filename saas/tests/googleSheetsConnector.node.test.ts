import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

const read = (file: string) => readFileSync(new URL(file, import.meta.url), 'utf8')

test('Google Workspace OAuth requests only read-only Sheets and Drive metadata scopes with durable offline consent', () => {
  const oauth = read('../lib/google-workspace/oauth.ts')
  assert.match(oauth, /spreadsheets\.readonly/)
  assert.match(oauth, /drive\.metadata\.readonly/)
  assert.doesNotMatch(oauth, /auth\/spreadsheets['"`]/)
  assert.doesNotMatch(oauth, /auth\/drive['"`]/)
  assert.match(oauth, /access_type: 'offline'/)
  assert.match(oauth, /prompt: 'consent'/)
  assert.match(oauth, /include_granted_scopes: 'true'/)
  assert.match(oauth, /https:\/\/oauth2\.googleapis\.com\/token/)
})

test('Google Workspace OAuth and token storage fail closed when Google grants only a subset of required read-only scopes', () => {
  const oauth = read('../lib/google-workspace/oauth.ts')
  const store = read('../lib/google-workspace/token-store.ts')
  const page = read('../app/dashboard/google-sheets/page.tsx')
  const copy = read('../lib/i18n/googleSheetsCopy.ts')
  assert.match(oauth, /missingGoogleWorkspaceScopes/)
  assert.match(oauth, /scopes: String\(payload\?\.scope \|\| ''\)/)
  assert.doesNotMatch(oauth, /payload\?\.scope \|\| GOOGLE_WORKSPACE_SCOPES\.join/)
  assert.match(store, /missingGoogleWorkspaceScopes\(grantedScopes\)/)
  assert.match(store, /connected: missingScopes\.length === 0/)
  assert.match(store, /missing required read-only permissions/)
  assert.match(store, /const refreshedScopes = refreshed\.scopes\.length \? refreshed\.scopes : rowScopes/)
  assert.match(page, /status\.connection\.missingScopes\?\.length/)
  assert.match(page, /t\.missingPermissions/)
  assert.match(copy, /missingPermissions:/)
})

test('Google connection tokens are encrypted with the existing Vault key and never stored in plaintext token columns', () => {
  const store = read('../lib/google-workspace/token-store.ts')
  const migration = read('../supabase/migrations/20260827000802_google_workspace_connections.sql')
  assert.match(store, /vaultEncrypt\(JSON\.stringify\(secret\)\)/)
  assert.match(store, /vaultDecrypt\(row\.token_ciphertext, row\.token_iv, row\.token_tag\)/)
  assert.match(migration, /token_ciphertext text not null/)
  assert.match(migration, /token_iv text not null/)
  assert.match(migration, /token_tag text not null/)
  assert.doesNotMatch(migration, /access_token/)
  assert.doesNotMatch(migration, /refresh_token/)
  assert.match(migration, /enable row level security/)
  assert.match(migration, /revoke all .* from anon, authenticated/)
})

test('Google Sheets data client is fixed-host, GET-only and bounded', () => {
  const sheets = read('../lib/google-workspace/sheets.ts')
  assert.match(sheets, /https:\/\/sheets\.googleapis\.com\/v4/)
  assert.match(sheets, /https:\/\/www\.googleapis\.com\/drive\/v3/)
  assert.match(sheets, /method: 'GET'/)
  assert.doesNotMatch(sheets, /method: 'POST'/)
  assert.doesNotMatch(sheets, /method: 'PATCH'/)
  assert.doesNotMatch(sheets, /method: 'PUT'/)
  assert.doesNotMatch(sheets, /method: 'DELETE'/)
  assert.match(sheets, /Math\.min\(500/)
  assert.match(sheets, /Math\.min\(100/)
  assert.match(sheets, /FORMATTED_VALUE/)
})

test('Google Sheets tools are exposed to both COS and MCP as read-only actions', () => {
  const builtIn = read('../lib/ai/cos/autonomy/builtInTools.ts')
  const mcp = read('../lib/google-workspace/mcp.ts')
  for (const tool of [
    'google_sheets.list_spreadsheets',
    'google_sheets.get_metadata',
    'google_sheets.read_range',
    'google_sheets.search_rows',
  ]) {
    assert.match(builtIn, new RegExp(tool.replace('.', '\\.')))
    assert.match(mcp, new RegExp(tool.replace('.', '\\.')))
  }
  assert.match(builtIn, /risk: 'read_only'/)
  assert.match(mcp, /actionKind: 'read'/)
  assert.match(mcp, /verified_user_identity_required/)
  assert.match(mcp, /GOOGLE_SHEETS_MCP_ALLOWLIST/)
  assert.match(mcp, /return result\.ok[\s\S]*ok: false as const, error:/)
  assert.doesNotMatch(mcp, /append_rows|update_cells|clear_range/)
})

test('OAuth and data API routes require the signed-in user and OAuth state is bound to that user', () => {
  const oauthRoute = read('../app/api/integrations/google-sheets/oauth/route.ts')
  const statusRoute = read('../app/api/integrations/google-sheets/status/route.ts')
  const dataRoute = read('../app/api/integrations/google-sheets/spreadsheets/route.ts')
  assert.match(oauthRoute, /getCurrentUser\(\)/)
  assert.match(oauthRoute, /expectedUser !== user\.id/)
  assert.match(oauthRoute, /httpOnly: true/)
  assert.match(oauthRoute, /sameSite: 'lax'/)
  assert.match(oauthRoute, /const BACK = '\/dashboard\/google-sheets'/)
  assert.match(statusRoute, /getCurrentUser\(\)/)
  assert.match(dataRoute, /getCurrentUser\(\)/)
  assert.match(statusRoute, /readOnly: true/)
})

test('Google Sheets page uses centralized five-language copy rather than inline English UI text', () => {
  const page = read('../app/dashboard/google-sheets/page.tsx')
  const copy = read('../lib/i18n/googleSheetsCopy.ts')
  assert.match(page, /googleSheetsCopy\(lang\)/)
  assert.doesNotMatch(page, /const COPY/)
  for (const language of ['en:', 'es:', 'pt:', 'pl:', 'ru:']) assert.match(copy, new RegExp(language))
})

test('Google Sheets connector regression is part of the mandatory COS deployment gate', () => {
  const gate = read('../scripts/vercel-cos-gates.mjs')
  assert.match(gate, /tests\/googleSheetsConnector\.node\.test\.ts/)
})
