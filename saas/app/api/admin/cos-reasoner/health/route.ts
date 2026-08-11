import { NextResponse } from 'next/server'
import { requireOwner } from '@/lib/auth/access'
import { resolveCosReasoner } from '@/lib/ai/cos/cosReasoner'
import { checkLocalInferenceHealth, localInferenceConfigFromEnv } from '@/lib/ai/local-inference'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const guard = await requireOwner()
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status })

  const resolved = resolveCosReasoner()
  if (resolved.config === null) {
    return NextResponse.json({
      ok: false,
      configured: false,
      healthy: false,
      model: null,
      reason: resolved.reason,
      fallbackEnabled: process.env.COS_EXTERNAL_AI_FALLBACK_ENABLED !== 'false',
    })
  }

  try {
    const health = await checkLocalInferenceHealth(localInferenceConfigFromEnv())
    return NextResponse.json({
      ok: health.ok,
      configured: true,
      healthy: health.ok,
      model: health.model,
      reasoner: resolved.config.label,
      error: health.error ?? null,
      fallbackEnabled: process.env.COS_EXTERNAL_AI_FALLBACK_ENABLED !== 'false',
    }, { status: health.ok ? 200 : 503 })
  } catch (error) {
    return NextResponse.json({
      ok: false,
      configured: true,
      healthy: false,
      model: process.env.LOCAL_AI_MODEL?.trim() || null,
      reasoner: resolved.config.label,
      error: error instanceof Error ? error.message : String(error),
      fallbackEnabled: process.env.COS_EXTERNAL_AI_FALLBACK_ENABLED !== 'false',
    }, { status: 503 })
  }
}
