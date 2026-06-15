// saas/console-core/executors/assemblyai.ts
import { registerExecutor } from '../defaultHost'
import type { ActionField, ActionSchema } from '../types'

const API = 'https://api.assemblyai.com/v2'
function key(): string | null { return process.env.ASSEMBLYAI_API_KEY || null }
async function getJSON(path: string) {
  const k = key(); if (!k) return { ok: false as const, error: 'ASSEMBLYAI_API_KEY not set' }
  const res = await fetch(`${API}${path}`, { headers: { authorization: k } })
  if (!res.ok) return { ok: false as const, error: `AssemblyAI error (HTTP ${res.status}): ${(await res.text()).slice(0, 300)}` }
  return { ok: true as const, json: await res.json() }
}
const schema = (id: string, label: string, verb: string, fields: ActionField[]): ActionSchema => ({ id, label, verb, fields })
const TRANSCRIPT: ActionField = { id: 'id', label: 'Transcript', type: 'remote_select', required: true, remoteSource: { action: 'assemblyai.list_transcripts', dataPath: 'transcripts', valueKey: 'id', labelTemplate: '{id} ({status})' } }

registerExecutor({
  providerId: 'assemblyai', actionId: 'list_transcripts', policyActionId: 'read_provider_status',
  schema: schema('assemblyai.list_transcripts', 'Recent Transcripts', 'view', []),
  async run() {
    const r = await getJSON('/transcript?limit=20'); if (!r.ok) return r
    const transcripts = ((r.json.transcripts || []) as any[]).map(t => ({ id: t.id, status: t.status, created: t.created, completed: t.completed }))
    return { ok: true, message: `${transcripts.length} transcript${transcripts.length === 1 ? '' : 's'}`, data: { count: transcripts.length, transcripts } }
  },
})
registerExecutor({
  providerId: 'assemblyai', actionId: 'transcript_details', policyActionId: 'read_provider_status',
  schema: schema('assemblyai.transcript_details', 'Transcript Details', 'view', [TRANSCRIPT]),
  async run(_ctx, input) {
    const id = String(input.id || ''); if (!id) return { ok: false, error: 'Transcript is required' }
    const r = await getJSON(`/transcript/${encodeURIComponent(id)}`); if (!r.ok) return r
    const t = r.json
    return { ok: true, message: `Transcript ${t.id} (${t.status})`, data: { id: t.id, status: t.status, language_code: t.language_code, audio_duration: t.audio_duration, text: String(t.text || '').slice(0, 200) } }
  },
})
