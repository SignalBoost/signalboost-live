// saas/lib/ai/batch/openaiBatch.ts
// Reusable OpenAI Batch engine. Submit a set of chat-completion requests at the
// flat 50% Batch discount, then retrieve and dispatch results on a later run.
// Honest by construction: a job is only marked completed when real outputs come back.
//
// tsconfig non-strict: flat results; never throws to callers.

import OpenAI, { toFile } from 'openai'
import { createClient } from '@supabase/supabase-js'

const TABLE = 'cos_batch_jobs'

function db() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  })
}
function client() {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
}

export type BatchRequest = { custom_id: string; body: any } // body = chat.completions params (model, messages, …)
export type BatchOutput = { custom_id: string; content: string }
export type BatchHandler = (outputs: BatchOutput[], context: any) => Promise<void>

// Submit a batch. Returns the local job id; results arrive later via pollBatches.
export async function submitBatch(
  kind: string,
  requests: BatchRequest[],
  context: any = {},
): Promise<{ ok: boolean; jobId?: string; error?: string }> {
  try {
    if (!requests.length) return { ok: false, error: 'no requests to submit' }
    const oa = client()
    const jsonl = requests
      .map((r) => JSON.stringify({ custom_id: r.custom_id, method: 'POST', url: '/v1/chat/completions', body: r.body }))
      .join('\n')

    const file = await oa.files.create({
      file: await toFile(Buffer.from(jsonl), `${kind}-${Date.now()}.jsonl`),
      purpose: 'batch',
    })
    const batch = await oa.batches.create({
      input_file_id: file.id,
      endpoint: '/v1/chat/completions',
      completion_window: '24h',
    })

    const { data, error } = await db()
      .from(TABLE)
      .insert({
        kind,
        provider: 'openai',
        openai_batch_id: batch.id,
        input_file_id: file.id,
        status: 'submitted',
        request_count: requests.length,
        context,
      })
      .select('id')
      .single()
    if (error) return { ok: false, error: error.message }
    return { ok: true, jobId: data.id }
  } catch (e: any) {
    return { ok: false, error: e?.message || 'submitBatch failed' }
  }
}

// Poll pending batches; for completed ones, fetch outputs, dispatch to the matching
// handler, and mark the job done. Handlers are passed in (serverless-safe — no
// reliance on a module-global registry surviving between invocations).
export async function pollBatches(
  handlers: Record<string, BatchHandler>,
): Promise<{ ok: boolean; processed: number; error?: string }> {
  try {
    const oa = client()
    const sb = db()
    const { data: pending } = await sb.from(TABLE).select('*').in('status', ['submitted', 'in_progress']).limit(20)
    let processed = 0

    for (const job of pending || []) {
      const batch = await oa.batches.retrieve(job.openai_batch_id)

      if (['validating', 'in_progress', 'finalizing'].includes(batch.status)) {
        if (job.status !== 'in_progress') {
          await sb.from(TABLE).update({ status: 'in_progress', updated_at: new Date().toISOString() }).eq('id', job.id)
        }
        continue
      }
      if (batch.status !== 'completed') {
        await sb.from(TABLE).update({ status: 'failed', error: String(batch.status), updated_at: new Date().toISOString() }).eq('id', job.id)
        continue
      }

      const outputs: BatchOutput[] = []
      if (batch.output_file_id) {
        const fileResp = await oa.files.content(batch.output_file_id)
        const text = await fileResp.text()
        for (const line of text.split('\n').filter(Boolean)) {
          try {
            const o = JSON.parse(line)
            outputs.push({ custom_id: o.custom_id, content: o.response?.body?.choices?.[0]?.message?.content || '' })
          } catch {}
        }
      }

      const handler = handlers[job.kind]
      if (handler) {
        try {
          await handler(outputs, job.context)
        } catch (e: any) {
          await sb.from(TABLE).update({ status: 'failed', error: e?.message || 'handler failed', updated_at: new Date().toISOString() }).eq('id', job.id)
          continue
        }
      }
      await sb.from(TABLE).update({ status: 'completed', result: { count: outputs.length }, updated_at: new Date().toISOString() }).eq('id', job.id)
      processed++
    }
    return { ok: true, processed }
  } catch (e: any) {
    return { ok: false, processed: 0, error: e?.message || 'pollBatches failed' }
  }
}
