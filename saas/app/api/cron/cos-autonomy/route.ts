import { NextRequest, NextResponse } from 'next/server'
import { loadCosLiveMissionBindings, runCosLiveTick, type CosLiveMissionBinding } from '@/lib/ai/cos/autonomy/liveRuntime.ts'
import { createSupabaseCosLiveTickStateStore } from '@/lib/ai/cos/autonomy/supabaseLiveState.ts'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  return Boolean(secret && req.headers.get('authorization') === `Bearer ${secret}`)
}

function modelPreference(): 'claude' | 'openai' | 'local' | undefined {
  const value = process.env.COS_AUTONOMY_MODEL?.trim().toLowerCase()
  return value === 'claude' || value === 'openai' || value === 'local' ? value : undefined
}

function defaultSupervisorBinding(req: NextRequest): CosLiveMissionBinding {
  const origin = new URL(req.url).origin
  return {
    portable: {
      portableId: 'self-healing-supervisor',
      baseUrl: `${origin}/api/internal/cos-portables/self-healing`,
      bearerToken: process.env.COS_PORTABLE_BRIDGE_SECRET || process.env.CRON_SECRET,
      timeoutMs: 55000,
    },
    mission: {
      missionId: 'signalboost-self-healing-supervisor',
      purpose: 'Keep the SignalBoost production deployment healthy. Detect failed deployments early, investigate with available evidence, and route justified repairs through the Self-Healing Supervisor governed execution path.',
      priorities: ['production availability', 'evidence-grounded diagnosis', 'smallest safe repair', 'verified recovery'],
      constraints: ['never invent evidence', 'never bypass Supervisor governance', 'never expose credentials', 'do not create work when the deployment is healthy'],
      successCriteria: ['no unresolved failed production deployment', 'every attempted repair is governed and auditable', 'healthy state is verified after action'],
    },
    autonomy: {
      maxCycles: 3,
      maxConsecutiveFailures: 2,
      maxRepeatedState: 2,
      minimumPlanConfidence: 0.65,
      requireEvidence: true,
      allowLowRiskReversibleWithoutApproval: true,
    },
  }
}

async function run(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })

  const configuredBindings = loadCosLiveMissionBindings()
  const bindings = configuredBindings.length ? configuredBindings : [defaultSupervisorBinding(req)]
  const store = createSupabaseCosLiveTickStateStore()
  const results = []
  for (const binding of bindings) {
    try {
      const result = await runCosLiveTick({
        binding,
        stateStore: store,
        modelPreference: modelPreference(),
        killSwitch: () => process.env.COS_AUTONOMY_KILL_SWITCH === '1' || process.env.COS_AUTONOMY_KILL_SWITCH === 'true',
      })
      results.push({ ok: true, missionId: binding.mission.missionId, portableId: binding.portable.portableId, result })
    } catch (error) {
      results.push({
        ok: false,
        missionId: binding.mission.missionId,
        portableId: binding.portable.portableId,
        error: error instanceof Error ? error.message : 'cos_autonomy_tick_failed',
      })
    }
  }

  return NextResponse.json({
    ok: results.every(item => item.ok),
    configured: true,
    configurationSource: configuredBindings.length ? 'COS_AUTONOMY_MISSIONS' : 'first_party_default',
    at: new Date().toISOString(),
    missions: bindings.length,
    results,
  })
}

export async function GET(req: NextRequest) { return run(req) }
export async function POST(req: NextRequest) { return run(req) }
