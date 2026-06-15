// saas/console-core/executors/elevenlabs.ts
//
// ElevenLabs provider on the portable engine. Read-only observability actions
// using ELEVENLABS_API_KEY (xi-api-key header). Importing this registers them.

import { registerExecutor } from '../defaultHost'
import type { ActionField, ActionSchema } from '../types'

const API = 'https://api.elevenlabs.io/v1'

function key(): string | null {
  return process.env.ELEVENLABS_API_KEY || null
}
async function getJSON(path: string): Promise<{ ok: true; json: any } | { ok: false; error: string }> {
  const k = key()
  if (!k) return { ok: false, error: 'ELEVENLABS_API_KEY not set' }
  const res = await fetch(`${API}${path}`, { headers: { 'xi-api-key': k, Accept: 'application/json' } })
  if (!res.ok) return { ok: false, error: `ElevenLabs error (HTTP ${res.status}): ${(await res.text()).slice(0, 300)}` }
  return { ok: true, json: await res.json() }
}
const schema = (id: string, label: string, verb: string, fields: ActionField[]): ActionSchema => ({ id, label, verb, fields })

const VOICE_FIELD: ActionField = {
  id: 'voice_id', label: 'Voice', type: 'remote_select', required: true,
  remoteSource: { action: 'elevenlabs.list_voices', dataPath: 'voices', valueKey: 'voice_id', labelTemplate: '{name}' },
}

// List Voices
registerExecutor({
  providerId: 'elevenlabs', actionId: 'list_voices', policyActionId: 'read_provider_status',
  schema: schema('elevenlabs.list_voices', 'List Voices', 'view', []),
  async run() {
    const r = await getJSON('/voices'); if (!r.ok) return r
    const voices = ((r.json.voices || []) as any[]).map(v => ({ voice_id: v.voice_id, name: v.name, category: v.category }))
    return { ok: true, message: `${voices.length} voice${voices.length === 1 ? '' : 's'}`, data: { count: voices.length, voices } }
  },
})

// Voice Details (picker-driven)
registerExecutor({
  providerId: 'elevenlabs', actionId: 'voice_details', policyActionId: 'read_provider_status',
  schema: schema('elevenlabs.voice_details', 'Voice Details', 'view', [VOICE_FIELD]),
  async run(_ctx, input) {
    const id = String(input.voice_id || ''); if (!id) return { ok: false, error: 'Voice is required' }
    const r = await getJSON(`/voices/${encodeURIComponent(id)}`); if (!r.ok) return r
    const v = r.json
    return { ok: true, message: `Voice: ${v.name}`, data: { voice_id: v.voice_id, name: v.name, category: v.category, description: v.description, labels: v.labels } }
  },
})

// List Models
registerExecutor({
  providerId: 'elevenlabs', actionId: 'list_models', policyActionId: 'read_provider_status',
  schema: schema('elevenlabs.list_models', 'List Models', 'view', []),
  async run() {
    const r = await getJSON('/models'); if (!r.ok) return r
    const arr = Array.isArray(r.json) ? r.json : (r.json.models || [])
    const models = (arr as any[]).map(m => ({ model_id: m.model_id, name: m.name, can_do_tts: m.can_do_text_to_speech }))
    return { ok: true, message: `${models.length} model${models.length === 1 ? '' : 's'}`, data: { count: models.length, models } }
  },
})

// Subscription & Usage
registerExecutor({
  providerId: 'elevenlabs', actionId: 'subscription', policyActionId: 'read_provider_status',
  schema: schema('elevenlabs.subscription', 'Subscription & Usage', 'view', []),
  async run() {
    const r = await getJSON('/user/subscription'); if (!r.ok) return r
    const s = r.json
    const used = Number(s.character_count || 0)
    const limit = Number(s.character_limit || 0)
    return { ok: true, message: `${s.tier || 'unknown'} — ${used.toLocaleString()} / ${limit.toLocaleString()} chars`,
      data: { tier: s.tier, characters_used: used, character_limit: limit, characters_remaining: Math.max(0, limit - used), can_extend: s.can_extend_character_limit, resets_unix: s.next_character_count_reset_unix } }
  },
})

// Generation History
registerExecutor({
  providerId: 'elevenlabs', actionId: 'list_history', policyActionId: 'read_provider_status',
  schema: schema('elevenlabs.list_history', 'Generation History', 'view', []),
  async run() {
    const r = await getJSON('/history?page_size=30'); if (!r.ok) return r
    const items = ((r.json.history || []) as any[]).map(h => ({ id: h.history_item_id, voice: h.voice_name, text: String(h.text || '').slice(0, 80), date_unix: h.date_unix }))
    return { ok: true, message: `${items.length} recent generation${items.length === 1 ? '' : 's'}`, data: { count: items.length, items } }
  },
})
