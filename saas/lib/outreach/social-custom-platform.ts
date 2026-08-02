// saas/lib/outreach/social-custom-platform-store.ts
//
// HOST SIDE of buyer-declared platforms.
//
// social-custom-platform.ts holds the registry and knows nothing about storage — that is
// what keeps it inside the portable boundary. This file is the SignalBoost host's answer
// to "where do declarations live": a table. A buyer running the portable elsewhere writes
// their own equivalent, or registers from a config file, and changes nothing in core.
//
// WHY IT RELOADS PER REQUEST. The registry is process memory, and serverless functions
// are short-lived and independent — a platform declared during one request is not present
// in the next invocation's process. So every route that publishes or lists platforms
// hydrates first. It is one indexed read of a table with a handful of rows, and the
// alternative (assuming warm state) fails intermittently in exactly the way that is
// hardest to diagnose.

import {
  registerCustomPlatform,
  listCustomPlatforms,
  unregisterCustomPlatform,
  type CustomPlatformConfig,
} from './social-custom-platform.ts'

type AnyClient = { from: (table: string) => any }

const TABLE = 'outreach_social_custom_platforms'

function rowToConfig(row: any): CustomPlatformConfig {
  return {
    id: String(row.platform_id),
    label: String(row.label),
    authUrl: String(row.auth_url),
    tokenUrl: row.token_url ? String(row.token_url) : undefined,
    scopes: Array.isArray(row.scopes) ? row.scopes.map(String) : [],
    publishUrl: String(row.publish_url),
    method: (row.method || 'POST') as 'POST' | 'PUT' | 'PATCH',
    headers: row.headers && typeof row.headers === 'object' ? row.headers : {},
    body:
      row.body_kind === 'form'
        ? { kind: 'form', template: (row.body_template || {}) as Record<string, string> }
        : row.body_kind === 'text'
          ? { kind: 'text', template: String(row.body_template ?? '') }
          : { kind: 'json', template: row.body_template ?? {} },
    idPath: row.id_path ? String(row.id_path) : undefined,
    idHeader: row.id_header ? String(row.id_header) : undefined,
    urlPath: row.url_path ? String(row.url_path) : undefined,
    permalinkTemplate: row.permalink_template ? String(row.permalink_template) : undefined,
    content: (row.content || 'text') as 'text' | 'video' | 'media',
    needsAccountRef: row.needs_account_ref === true,
  }
}

/**
 * Load every declared platform into the registry.
 *
 * Never throws. A malformed row is skipped with a console warning rather than taking down
 * the whole publish path — one bad declaration must not stop the other platforms working,
 * and the row is visible in the management UI to be corrected.
 */
export async function loadCustomPlatforms(admin: AnyClient): Promise<{ loaded: number; skipped: number }> {
  let loaded = 0
  let skipped = 0
  try {
    const { data, error } = await admin.from(TABLE).select('*')
    if (error) return { loaded: 0, skipped: 0 }

    // Drop anything previously registered that is no longer in the table, so a deleted
    // platform actually disappears instead of lingering in a warm process.
    const present = new Set((data || []).map((row: any) => String(row.platform_id)))
    for (const existing of listCustomPlatforms()) {
      if (!present.has(existing.id)) unregisterCustomPlatform(existing.id)
    }

    for (const row of data || []) {
      try {
        registerCustomPlatform(rowToConfig(row))
        loaded += 1
      } catch (reason) {
        skipped += 1
        console.warn(`custom platform "${row?.platform_id}" was not registered:`, reason)
      }
    }
  } catch {
    // Storage unavailable: the built-in platforms still work.
  }
  return { loaded, skipped }
}

export async function listStoredCustomPlatforms(admin: AnyClient): Promise<any[]> {
  const { data } = await admin.from(TABLE).select('*').order('platform_id', { ascending: true })
  return data || []
}

export async function upsertCustomPlatform(
  admin: AnyClient,
  input: CustomPlatformConfig,
  createdBy?: string | null,
): Promise<{ ok: boolean; error?: string }> {
  // Validate through the SAME function the runtime uses, so the UI cannot store a
  // declaration that would be refused at publish time. Registering here also means the
  // current process is immediately correct without waiting for the next reload.
  try {
    registerCustomPlatform(input)
  } catch (reason: any) {
    return { ok: false, error: String(reason?.message || reason) }
  }

  const row = {
    platform_id: input.id,
    label: input.label,
    auth_url: input.authUrl,
    token_url: input.tokenUrl || null,
    scopes: input.scopes || [],
    publish_url: input.publishUrl,
    method: input.method || 'POST',
    headers: input.headers || {},
    body_kind: input.body.kind,
    body_template: input.body.kind === 'text' ? (input.body as any).template : (input.body as any).template ?? {},
    id_path: input.idPath || null,
    id_header: input.idHeader || null,
    url_path: input.urlPath || null,
    permalink_template: input.permalinkTemplate || null,
    content: input.content || 'text',
    needs_account_ref: input.needsAccountRef === true,
    created_by: createdBy || null,
    updated_at: new Date().toISOString(),
  }

  const { error } = await admin.from(TABLE).upsert(row, { onConflict: 'platform_id' })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function deleteCustomPlatform(admin: AnyClient, platformId: string): Promise<{ ok: boolean; error?: string }> {
  const id = String(platformId || '').trim()
  if (!id) return { ok: false, error: 'platform id is required' }
  const { error } = await admin.from(TABLE).delete().eq('platform_id', id)
  if (error) return { ok: false, error: error.message }
  unregisterCustomPlatform(id)
  return { ok: true }
}
