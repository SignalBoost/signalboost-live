import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getCurrentUser } from '@/lib/auth/permission-middleware'
import { loadCosLiveMissionBindings } from '@/lib/ai/cos/autonomy/liveRuntime.ts'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const present = (name: string) => Boolean(process.env[name]?.trim())

async function isAuthorized(req: NextRequest): Promise<boolean> {
  const secret = process.env.CRON_SECRET
  if (secret && req.headers.get('authorization') === `Bearer ${secret}`) return true
  const user = await getCurrentUser(req)
  return Boolean(user && (user as any).role === 'owner')
}

export async function GET(req: NextRequest) {
  if (!(await isAuthorized(req))) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })

  const checks = {
    cronSecret: present('CRON_SECRET'),
    portableBridgeSecret: present('COS_PORTABLE_BRIDGE_SECRET') || present('CRON_SECRET'),
    supabaseUrl: present('NEXT_PUBLIC_SUPABASE_URL'),
    supabaseServiceRole: present('SUPABASE_SERVICE_ROLE_KEY'),
    vercelToken: present('VERCEL_TOKEN'),
    vercelProjectId: present('VERCEL_PROJECT_ID'),
    modelProvider: present('ANTHROPIC_API_KEY') || present('OPENAI_API_KEY') || present('LOCAL_AI_BASE_URL'),
  }

  let stateTable = { readable: false, error: '' }
  if (checks.supabaseUrl && checks.supabaseServiceRole) {
    try {
      const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
      const { error } = await db.from('cos_autonomy_state').select('mission_id').limit(1)
      stateTable = error ? { readable: false, error: error.message } : { readable: true, error: '' }
    } catch (error) {
      stateTable = { readable: false, error: error instanceof Error ? error.message : 'state_table_check_failed' }
    }
  }

  let customMissionCount = 0
  let missionConfigError = ''
  try { customMissionCount = loadCosLiveMissionBindings().length } catch (error) {
    missionConfigError = error instanceof Error ? error.message : 'mission_config_invalid'
  }

  const blockers: string[] = []
  if (!checks.cronSecret) blockers.push('CRON_SECRET is missing; Vercel cannot authenticate COS autonomy ticks.')
  if (!checks.supabaseUrl || !checks.supabaseServiceRole) blockers.push('Supabase URL/service-role configuration is missing; COS cannot persist leadership state.')
  if (!stateTable.readable) blockers.push(`cos_autonomy_state is not readable${stateTable.error ? `: ${stateTable.error}` : ''}. Apply the 20260808_cos_autonomy_state migration.`)
  if (!checks.vercelToken || !checks.vercelProjectId) blockers.push('VERCEL_TOKEN and VERCEL_PROJECT_ID are missing; the default Self-Healing portable cannot observe deployments.')
  if (!checks.modelProvider) blockers.push('No COS autonomy model is available. Configure Anthropic, OpenAI, or the private local endpoint.')
  if (missionConfigError) blockers.push(`COS_AUTONOMY_MISSIONS is invalid: ${missionConfigError}`)

  return NextResponse.json({
    ok: true,
    ready: blockers.length === 0,
    verdict: blockers.length === 0
      ? 'READY — COS autonomy can run. Custom missions are optional; the first-party Self-Healing Supervisor mission is the default.'
      : 'NOT READY — clear the listed deployment blockers before relying on live autonomy.',
    blockers,
    checks,
    stateTable,
    missionConfiguration: customMissionCount > 0 ? { source: 'COS_AUTONOMY_MISSIONS', count: customMissionCount } : { source: 'first_party_default', count: 1 },
    schedule: { path: '/api/cron/cos-autonomy', cadence: 'every 5 minutes' },
  })
}
