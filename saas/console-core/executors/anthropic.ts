// saas/console-core/executors/anthropic.ts
import { registerExecutor } from '../defaultHost'
import type { ActionField, ActionSchema } from '../types'

const API = 'https://api.anthropic.com/v1'
function key(): string | null { return process.env.ANTHROPIC_API_KEY || null }
async function getJSON(path: string) {
  const k = key(); if (!k) return { ok: false as const, error: 'ANTHROPIC_API_KEY not set' }
  const res = await fetch(`${API}${path}`, { headers: { 'x-api-key': k, 'anthropic-version': '2023-06-01' } })
  if (!res.ok) return { ok: false as const, error: `Anthropic error (HTTP ${res.status}): ${(await res.text()).slice(0, 300)}` }
  return { ok: true as const, json: await res.json() }
}
const schema = (id: string, label: string, verb: string, fields: ActionField[]): ActionSchema => ({ id, label, verb, fields })
const MODEL: ActionField = { id: 'model', label: 'Model', type: 'remote_select', required: true, remoteSource: { action: 'anthropic.list_models', dataPath: 'models', valueKey: 'id', labelTemplate: '{display_name}' } }

registerExecutor({
  providerId: 'anthropic', actionId: 'list_models', policyActionId: 'read_provider_status',
  schema: schema('anthropic.list_models', 'View Models', 'view', []),
  async run() {
    const r = await getJSON('/models?limit=100'); if (!r.ok) return r
    const models = ((r.json.data || []) as any[]).map(m => ({ id: m.id, display_name: m.display_name, created_at: m.created_at }))
    return { ok: true, message: `${models.length} model${models.length === 1 ? '' : 's'}`, data: { count: models.length, models } }
  },
})
registerExecutor({
  providerId: 'anthropic', actionId: 'retrieve_model', policyActionId: 'read_provider_status',
  schema: schema('anthropic.retrieve_model', 'Model Details', 'view', [MODEL]),
  async run(_ctx, input) {
    const id = String(input.model || ''); if (!id) return { ok: false, error: 'Model is required' }
    const r = await getJSON(`/models/${encodeURIComponent(id)}`); if (!r.ok) return r
    const m = r.json
    return { ok: true, message: `Model: ${m.display_name || m.id}`, data: { id: m.id, display_name: m.display_name, created_at: m.created_at } }
  },
})
