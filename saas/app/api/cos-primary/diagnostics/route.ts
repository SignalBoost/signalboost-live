import { NextResponse } from 'next/server'
import { requireOwner } from '@/lib/auth/access'
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import { buildCosLiveSystemState } from '@/lib/ai/cos/cosLiveSystemState'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function threshold(): number {
  const value = Number(process.env.COS_LOCAL_CONFIDENCE_THRESHOLD || '0.72')
  return Number.isFinite(value) ? Math.max(0.5, Math.min(0.98, value)) : 0.72
}

export async function GET() {
  const guard = await requireOwner()
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status })

  const [liveSystemState, learningGaps] = await Promise.all([
    buildCosLiveSystemState({ userId: guard.ctx.userId, privileged: true }),
    (async () => {
      const db = cosServiceDb()
      if (!db) return []
      const result = await db.from('cos_learning_gaps')
        .select('id,subject,question,confidence,escalation_reason,repeated_count,status,last_seen_at,resolved_at')
        .eq('task_id', 'support')
        .eq('capability', 'general_reasoning')
        .order('last_seen_at', { ascending: false })
        .limit(20)
      return result.error ? [] : result.data ?? []
    })(),
  ])

  return NextResponse.json({
    isolation_mode: !liveSystemState.externalFallbackEnabled,
    external_ai_invoked: false,
    cloud_fallback_enabled: liveSystemState.externalFallbackEnabled,
    local_model: {
      configured: liveSystemState.localReasoner.configured,
      healthy: liveSystemState.localReasoner.healthy,
      model: liveSystemState.localReasoner.model,
      endpoint_configured: Boolean(process.env.LOCAL_AI_BASE_URL?.trim()),
      api_key_configured: Boolean(process.env.LOCAL_AI_API_KEY?.trim()),
      allowed_hosts_configured: Boolean(process.env.LOCAL_AI_ALLOWED_HOSTS?.trim()),
      error: liveSystemState.localReasoner.error,
    },
    confidence_threshold: threshold(),
    recent_learning_gaps: learningGaps,
    live_system_state: liveSystemState,
    generated_at: liveSystemState.generatedAt,
  })
}
