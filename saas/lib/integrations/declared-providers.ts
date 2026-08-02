// saas/lib/integrations/declared-providers.ts
//
// BRING YOUR OWN INTEGRATION.
//
// registry.ts already exposes registerProvider(), so the engine has always been able to
// accept a provider it does not ship. What was missing is where a buyer's own providers
// live between requests, and a way to add one without editing code. This file is that:
// declarations in a table, loaded into the registry before anything reads the catalog.
//
// A declared provider is a DESCRIPTOR — id, category, how it authenticates, where its
// documentation is, what it claims to support. It carries no capability implementations,
// so it appears in the catalog and can be connected, but its capabilities show as
// declared-not-implemented until someone writes them. That distinction is deliberate and
// visible: a buyer should never discover at run time that a listed capability was a
// promise rather than a function.
//
// Named unlike its neighbours on purpose. Two files whose names differ by a "-store"
// suffix have twice been cross-pasted in this repo, losing the real content of both.

import type { IntegrationProvider, IntegrationCategory, AuthKind, Capability } from './types.ts'
import { registerProvider, listProviders } from './registry.ts'

type AnyClient = { from: (table: string) => any }

const TABLE = 'integration_custom_providers'

const CATEGORIES: IntegrationCategory[] = [
  'crm', 'email_marketing', 'messaging', 'cdp', 'enrichment', 'scheduling', 'payments',
  'audit', 'cybersecurity', 'compliance',
]

export type DeclaredProviderInput = {
  id: string
  label: string
  category: IntegrationCategory
  auth: AuthKind
  authUrl?: string | null
  tokenUrl?: string | null
  scopes?: string[]
  docsUrl?: string | null
  capabilities?: string[]
}

/** Reject a declaration that could not produce a working connection. */
export function validateDeclaredProvider(input: DeclaredProviderInput): string | null {
  const id = String(input?.id || '').trim()
  if (!id) return 'A provider id is required.'
  if (!/^[a-z0-9_]+$/.test(id)) return 'The provider id may contain only lower-case letters, numbers and underscores.'
  if (!String(input?.label || '').trim()) return 'A display name is required.'
  if (!CATEGORIES.includes(input?.category)) return `Category must be one of: ${CATEGORIES.join(', ')}.`
  if (input?.auth !== 'oauth2' && input?.auth !== 'api_key') return 'Authentication must be oauth2 or api_key.'
  // OAuth needs somewhere to send the user; without it the connect button has nothing
  // to open, and the failure would surface much later than it should.
  if (input.auth === 'oauth2' && !String(input.authUrl || '').trim()) return 'An authorize URL is required for OAuth providers.'
  return null
}

function rowToProvider(row: any): IntegrationProvider {
  return {
    id: String(row.provider_id),
    label: String(row.label),
    category: row.category as IntegrationCategory,
    auth: row.auth as AuthKind,
    authUrl: row.auth_url || undefined,
    tokenUrl: row.token_url || undefined,
    scopes: Array.isArray(row.scopes) ? row.scopes.map(String) : [],
    docsUrl: row.docs_url || undefined,
    capabilities: (Array.isArray(row.capabilities) ? row.capabilities.map(String) : []) as Capability[],
  }
}

/**
 * Load declared providers into the registry.
 *
 * Never throws. Storage being unavailable must leave the catalog's own providers
 * working rather than blanking the whole screen.
 */
export async function loadDeclaredProviders(admin: AnyClient): Promise<{ loaded: number }> {
  let loaded = 0
  try {
    const { data, error } = await admin.from(TABLE).select('*')
    if (error) return { loaded: 0 }
    for (const row of data || []) {
      try { registerProvider(rowToProvider(row)); loaded += 1 }
      catch (reason) { console.warn(`declared provider "${row?.provider_id}" was not registered:`, reason) }
    }
  } catch { /* catalog providers still work */ }
  return { loaded }
}

export async function listDeclaredProviders(admin: AnyClient): Promise<any[]> {
  const { data } = await admin.from(TABLE).select('*').order('provider_id', { ascending: true })
  return data || []
}

export async function upsertDeclaredProvider(
  admin: AnyClient,
  input: DeclaredProviderInput,
  createdBy?: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const problem = validateDeclaredProvider(input)
  if (problem) return { ok: false, error: problem }

  // A declaration must not silently replace a catalog provider that has real
  // implementations behind it — that would turn working capabilities into descriptors.
  const clash = listProviders().find(p => p.id === input.id)
  if (clash && Object.keys(clash).some(key => typeof (clash as any)[key] === 'function')) {
    return { ok: false, error: `"${input.id}" is already a built-in provider with implemented capabilities and cannot be redeclared.` }
  }

  const { error } = await admin.from(TABLE).upsert({
    provider_id: input.id,
    label: input.label,
    category: input.category,
    auth: input.auth,
    auth_url: input.authUrl || null,
    token_url: input.tokenUrl || null,
    scopes: input.scopes || [],
    docs_url: input.docsUrl || null,
    capabilities: input.capabilities || [],
    created_by: createdBy || null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'provider_id' })

  if (error) return { ok: false, error: error.message }
  registerProvider(rowToProvider({
    provider_id: input.id, label: input.label, category: input.category, auth: input.auth,
    auth_url: input.authUrl, token_url: input.tokenUrl, scopes: input.scopes,
    docs_url: input.docsUrl, capabilities: input.capabilities,
  }))
  return { ok: true }
}

export async function deleteDeclaredProvider(admin: AnyClient, providerId: string): Promise<{ ok: boolean; error?: string }> {
  const id = String(providerId || '').trim()
  if (!id) return { ok: false, error: 'A provider id is required.' }
  const { error } = await admin.from(TABLE).delete().eq('provider_id', id)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
