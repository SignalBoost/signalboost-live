import { createHash } from 'node:crypto'
import { cosServiceDb } from '@/lib/cos-core/storage'

const VOLATILE_OR_ACTIONABLE = /\b(today|tonight|tomorrow|yesterday|current|currently|latest|recent|now|live|price|pricing|cost|count|total|revenue|mrr|arr|metric|metrics|user|users|credit|credits|plan|plans|news|weather|market|competitor|regulation|law|status|progress|campaign|outreach|email|send|create|make|build|generate|publish|delete|update|change|fix|repair|audit|repo|repository|code|commit|branch|deploy|deployment|vercel|supabase|search|research|find|lookup|remember|forget|history|conversation|account|billing|subscription|login|password|token|secret)\b/i

export function isStableSupportReuseCandidate(input: {
  prompt: string
  isPrivileged: boolean
  executeMode?: boolean
  hasAttachments?: boolean
}): boolean {
  const prompt = input.prompt.trim()
  if (!prompt || prompt.length < 8 || prompt.length > 1200) return false
  if (input.isPrivileged || input.executeMode || input.hasAttachments) return false
  if (VOLATILE_OR_ACTIONABLE.test(prompt)) return false
  return true
}

export function supportReuseKey(input: {
  prompt: string
  language: string
  currentPage: string
}): string {
  const canonical = JSON.stringify({
    v: 1,
    prompt: input.prompt.trim().replace(/\s+/g, ' ').toLowerCase(),
    language: input.language.toLowerCase(),
    currentPage: input.currentPage || '/',
  })
  return `support-reuse:${createHash('sha256').update(canonical).digest('hex')}`
}

type StoredSupportReply = { text?: string; createdAt?: string }

export async function loadSupportReuse(key: string): Promise<string | null> {
  const db = cosServiceDb()
  if (!db) return null
  try {
    const { data, error } = await db.from('cos_text_cache').select('response_data').eq('cache_key', key).maybeSingle()
    if (error) return null
    const stored = data?.response_data as StoredSupportReply | undefined
    return stored?.text?.trim() || null
  } catch {
    return null
  }
}

export async function saveSupportReuse(key: string, reply: string): Promise<void> {
  const text = reply.trim()
  if (!text) return
  const db = cosServiceDb()
  if (!db) return
  try {
    await db.from('cos_text_cache').upsert({
      cache_key: key,
      task_id: 'support-stable-reuse',
      response_data: { text, createdAt: new Date().toISOString() },
      updated_at: new Date().toISOString(),
    })
  } catch {
    // Durable reuse is an optimization only.
  }
}
