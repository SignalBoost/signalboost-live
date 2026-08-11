// saas/console-core/executors/gemini.ts
import { registerExecutor } from '../defaultHost.ts'
import { getSecret } from '../secrets.ts'
import type { ActionField, ActionSchema } from '../types.ts'

const API = 'https://generativelanguage.googleapis.com/v1beta'
function key(): string | null { return getSecret('GEMINI_API_KEY') || null }
async function getJSON(path: string) {
  const k = key(); if (!k) return { ok: false as const, error: 'GEMINI_API_KEY not set' }
  const res = await fetch(`${API}${path}`, { headers: { 'x-goog-api-key': k } })
  if (!res.ok) return { ok: false as const, error: `Gemini error (HTTP ${res.status}): ${(await res.text()).slice(0, 300)}` }
  return { ok: true as const, json: await res.json() }
}

const schema = (id: string, label: string, verb: string, fields: ActionField[]): ActionSchema => ({ id, label, verb, fields })
const MODEL: ActionField = { id: 'model', label: 'Model', type: 'remote_select', required: true, remoteSource: { action: 'gemini.list_models', dataPath: 'models', valueKey: 'name', labelTemplate: '{displayName}' } }

registerExecutor({
  providerId: 'gemini', actionId: 'list_models', policyActionId: 'read_provider_status',
  schema: schema('gemini.list_models', 'View Models', 'view', []),
  async run() {
    const r = await getJSON('/models?pageSize=100'); if (!r.ok) return r
    const models = ((r.json.models || []) as any[]).map(m => ({ name: m.name, displayName: m.displayName, methods: (m.supportedGenerationMethods || []).join(', ') }))
    return { ok: true, message: `${models.length} model${models.length === 1 ? '' : 's'}`, data: { count: models.length, models } }
  },
})

registerExecutor({
  providerId: 'gemini', actionId: 'model_details', policyActionId: 'read_provider_status',
  schema: schema('gemini.model_details', 'Model Details', 'view', [MODEL]),
  async run(_ctx, input) {
    const name = String(input.model || ''); if (!name) return { ok: false, error: 'Model is required' }
    const r = await getJSON(`/${name}`); if (!r.ok) return r
    const m = r.json
    return { ok: true, message: `Model: ${m.displayName || m.name}`, data: { name: m.name, displayName: m.displayName, description: m.description, inputTokenLimit: m.inputTokenLimit, outputTokenLimit: m.outputTokenLimit, methods: (m.supportedGenerationMethods || []).join(', ') } }
  },
})
