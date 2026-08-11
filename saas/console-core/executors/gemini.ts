// saas/console-core/executors/gemini.ts
import { registerExecutor } from '../defaultHost.ts'
import type { ActionField, ActionSchema } from '../types.ts'

const GEMINI_DISABLED_FOR_COS_ISOLATION = true

function disabled() {
  return { ok: false as const, error: 'Gemini is disabled during the COS independence/isolation benchmark.' }
}

const schema = (id: string, label: string, verb: string, fields: ActionField[]): ActionSchema => ({ id, label, verb, fields })
const MODEL: ActionField = { id: 'model', label: 'Model', type: 'remote_select', required: true, remoteSource: { action: 'gemini.list_models', dataPath: 'models', valueKey: 'name', labelTemplate: '{displayName}' } }

registerExecutor({
  providerId: 'gemini', actionId: 'list_models', policyActionId: 'read_provider_status',
  schema: schema('gemini.list_models', 'View Models', 'view', []),
  async run() {
    if (GEMINI_DISABLED_FOR_COS_ISOLATION) return disabled()
    return disabled()
  },
})

registerExecutor({
  providerId: 'gemini', actionId: 'model_details', policyActionId: 'read_provider_status',
  schema: schema('gemini.model_details', 'Model Details', 'view', [MODEL]),
  async run() {
    if (GEMINI_DISABLED_FOR_COS_ISOLATION) return disabled()
    return disabled()
  },
})
