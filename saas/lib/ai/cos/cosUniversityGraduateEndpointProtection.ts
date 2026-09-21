// saas/lib/ai/cos/cosUniversityGraduateEndpointProtection.ts
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'

const ENDPOINT_ID = /^[a-z0-9_-]{3,120}$/i

export function graduateRunpodEndpointId(scope: unknown): string | null {
  if (!scope || typeof scope !== 'object' || Array.isArray(scope)) return null
  const raw = String((scope as Record<string, unknown>).runtimeBaseUrl || '').trim()
  if (!raw) return null
  try {
    const url = new URL(raw)
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return null
    const suffix = '.api.runpod.ai'
    if (!url.hostname.endsWith(suffix)) return null
    const endpointId = url.hostname.slice(0, -suffix.length)
    return ENDPOINT_ID.test(endpointId) ? endpointId.toLowerCase() : null
  } catch {
    return null
  }
}

export async function activeGraduateRunpodEndpointIds(): Promise<ReadonlySet<string>> {
  const db = cosServiceDb()
  if (!db) throw new Error('graduate_endpoint_protection_database_unavailable')
  const rows = await db.from('cos_university_graduate_model_registry')
    .select('platform_scope')
    .eq('status', 'active')
    .eq('runtime_provider', 'runpod')
    .limit(200)
  if (rows.error) throw rows.error
  const ids = new Set<string>()
  for (const row of rows.data || []) {
    const endpointId = graduateRunpodEndpointId((row as { platform_scope?: unknown }).platform_scope)
    if (endpointId) ids.add(endpointId)
  }
  return ids
}
