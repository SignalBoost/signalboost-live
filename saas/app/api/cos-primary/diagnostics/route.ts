import { NextResponse } from 'next/server'
import { requireOwner } from '@/lib/auth/access'
import { checkLocalInferenceHealth, localInferenceConfigFromEnv } from '@/lib/ai/local-inference'
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function threshold(): number {
  const value = Number(process.env.COS_LOCAL_CONFIDENCE_THRESHOLD || '0.72')
  return Number.isFinite(value) ? Math.max(0.5, Math.min(0.98, value)) : 0.72
}

function configured(): boolean {
  return process.env.COS_LOCAL_FIRST_ENABLED !== 'false'
    && Boolean(process.env.LOCAL_AI_BASE_URL?.trim())
    && Boolean(process.env.LOCAL_AI_MODEL?.trim())
}

export async function GET() {
  const guard = await requireOwner()
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status })

  let localHealth: { ok: boolean; model?: string; error?: string } = { ok: false, error: 'Local COS inference is not configured.' }
  if (configured()) {
    try {
      const config = localInferenceConfigFromEnv()
      localHealth = await checkLocalInferenceHealth(config)
    } catch (error) {
      localHealth = {
        ok: false,
        error: error instanceof Error ? error.message : 'Local inference configuration is invalid.',
      }
    }
  }

  const db = cosServiceDb()
  let learningGaps: unknown[] = []
  if (db) {
    const result = await db.from('cos_learning_gaps')
      .select('id,subject,question,confidence,escalation_reason,repeated_count,status,last_seen_at,resolved_at')
      .eq('task_id', 'support')
      .eq('capability', 'general_reasoning')
      .order('last_seen_at', { ascending: false })
      .limit(20)
    if (!result.error) learningGaps = result.data ?? []
  }

  return NextResponse.json({
    isolation_mode: true,
    external_ai_invoked: false,
    cloud_fallback_enabled: false,
    local_model: {
      configured: configured(),
      healthy: localHealth.ok,
      model: localHealth.model || process.env.LOCAL_AI_MODEL?.trim() || null,
      endpoint_configured: Boolean(process.env.LOCAL_AI_BASE_URL?.trim()),
      api_key_configured: Boolean(process.env.LOCAL_AI_API_KEY?.trim()),
      allowed_hosts_configured: Boolean(process.env.LOCAL_AI_ALLOWED_HOSTS?.trim()),
      error: localHealth.ok ? null : localHealth.error || 'Local model health check failed.',
    },
    confidence_threshold: threshold(),
    recent_learning_gaps: learningGaps,
    generated_at: new Date().toISOString(),
  })
}
