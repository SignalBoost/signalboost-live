// saas/console-core/executors/openai.ts
//
// First provider migrated to run through the engine (Phase 3 starter). It is a
// real, self-contained ActionExecutor — it does NOT touch the legacy route.
// Importing this module registers the executor as a side effect.

import { registerExecutor } from '../defaultHost'

registerExecutor({
  providerId: 'openai',
  actionId: 'list_models',
  policyActionId: 'read_provider_status', // ungated read
  schema: { id: 'openai.list_models', label: 'View Models', verb: 'view', fields: [] },
  async run() {
    const key = process.env.OPENAI_API_KEY
    if (!key) return { ok: false, error: 'OPENAI_API_KEY not set' }
    const res = await fetch('https://api.openai.com/v1/models', {
      headers: { Authorization: 'Bearer ' + key },
    })
    if (!res.ok) {
      const e = await res.text()
      return { ok: false, error: e || res.statusText }
    }
    const data = await res.json()
    const models = ((data.data || []) as any[])
      .map(m => ({ id: m.id, owned_by: m.owned_by }))
      .sort((a, b) => String(a.id).localeCompare(String(b.id)))
    return { ok: true, message: `${models.length} model${models.length === 1 ? '' : 's'}`, data: { count: models.length, models } }
  },
})
