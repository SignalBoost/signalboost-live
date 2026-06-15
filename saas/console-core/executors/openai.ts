// saas/console-core/executors/openai.ts
//
// OpenAI provider on the portable engine. Read-only observability actions that
// work with just OPENAI_API_KEY. Importing this module registers them.

import { registerExecutor } from '../defaultHost'
import type { ActionField, ActionSchema } from '../types'

const API = 'https://api.openai.com/v1'

function key(): string | null {
  return process.env.OPENAI_API_KEY || null
}
async function getJSON(path: string): Promise<{ ok: true; json: any } | { ok: false; error: string }> {
  const k = key()
  if (!k) return { ok: false, error: 'OPENAI_API_KEY not set' }
  const res = await fetch(`${API}${path}`, { headers: { Authorization: 'Bearer ' + k } })
  if (!res.ok) return { ok: false, error: `OpenAI error (HTTP ${res.status}): ${(await res.text()).slice(0, 300)}` }
  return { ok: true, json: await res.json() }
}
const schema = (id: string, label: string, verb: string, fields: ActionField[]): ActionSchema => ({ id, label, verb, fields })

const MODEL_FIELD: ActionField = {
  id: 'model', label: 'Model', type: 'remote_select', required: true,
  remoteSource: { action: 'openai.list_models', dataPath: 'models', valueKey: 'id', labelTemplate: '{id}' },
}

// View Models
registerExecutor({
  providerId: 'openai', actionId: 'list_models', policyActionId: 'read_provider_status',
  schema: schema('openai.list_models', 'View Models', 'view', []),
  async run() {
    const r = await getJSON('/models'); if (!r.ok) return r
    const models = ((r.json.data || []) as any[])
      .map(m => ({ id: m.id, owned_by: m.owned_by }))
      .sort((a, b) => String(a.id).localeCompare(String(b.id)))
    return { ok: true, message: `${models.length} model${models.length === 1 ? '' : 's'}`, data: { count: models.length, models } }
  },
})

// Model Details (picker-driven)
registerExecutor({
  providerId: 'openai', actionId: 'retrieve_model', policyActionId: 'read_provider_status',
  schema: schema('openai.retrieve_model', 'Model Details', 'view', [MODEL_FIELD]),
  async run(_ctx, input) {
    const model = String(input.model || ''); if (!model) return { ok: false, error: 'Model is required' }
    const r = await getJSON(`/models/${encodeURIComponent(model)}`); if (!r.ok) return r
    const m = r.json
    return { ok: true, message: `Model: ${m.id}`, data: { id: m.id, owned_by: m.owned_by, created: m.created } }
  },
})

// List Files
registerExecutor({
  providerId: 'openai', actionId: 'list_files', policyActionId: 'read_provider_status',
  schema: schema('openai.list_files', 'List Files', 'view', []),
  async run() {
    const r = await getJSON('/files'); if (!r.ok) return r
    const files = ((r.json.data || []) as any[]).map(f => ({ id: f.id, filename: f.filename, bytes: f.bytes, purpose: f.purpose, created_at: f.created_at }))
    return { ok: true, message: `${files.length} file${files.length === 1 ? '' : 's'}`, data: { count: files.length, files } }
  },
})

// Fine-tuning Jobs
registerExecutor({
  providerId: 'openai', actionId: 'list_fine_tunes', policyActionId: 'read_provider_status',
  schema: schema('openai.list_fine_tunes', 'Fine-tuning Jobs', 'view', []),
  async run() {
    const r = await getJSON('/fine_tuning/jobs?limit=20'); if (!r.ok) return r
    const jobs = ((r.json.data || []) as any[]).map(j => ({ id: j.id, model: j.model, status: j.status, created_at: j.created_at }))
    return { ok: true, message: `${jobs.length} fine-tuning job${jobs.length === 1 ? '' : 's'}`, data: { count: jobs.length, jobs } }
  },
})

// Batch Jobs
registerExecutor({
  providerId: 'openai', actionId: 'list_batches', policyActionId: 'read_provider_status',
  schema: schema('openai.list_batches', 'Batch Jobs', 'view', []),
  async run() {
    const r = await getJSON('/batches?limit=20'); if (!r.ok) return r
    const batches = ((r.json.data || []) as any[]).map(b => ({ id: b.id, status: b.status, endpoint: b.endpoint, created_at: b.created_at }))
    return { ok: true, message: `${batches.length} batch${batches.length === 1 ? '' : 'es'}`, data: { count: batches.length, batches } }
  },
})
