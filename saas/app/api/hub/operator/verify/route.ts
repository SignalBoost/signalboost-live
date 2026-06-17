// saas/app/api/hub/operator/verify/route.ts
//
// Live self-verification. Owner-gated. Confirms the installation (Module 10),
// dry-runs every registered action in SIMULATION, and runs LIVE credential/health
// probes against every provider. Emits the ship confirmation ONLY when every check
// passes — installation whole, no stubs, all providers reachable.

import { NextResponse } from 'next/server'
import { requireOwner } from '@/lib/auth/access'
import { createOperator } from '@/console-core/operator'
import { createOperatorHost } from '@/lib/hub/operatorHost'
import { listRegistered } from '@/console-core/defaultHost'
import { probeAll } from '@/lib/hub/preflightProbe'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

type ActionReport = { action: string; ok: boolean; stage: string; status: string; detail?: string }

export async function GET() {
  const guard = await requireOwner()
  if (!guard.ok) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status })

  const operator = createOperator(createOperatorHost())
  const installation = operator.verify()
  const role = guard.ctx.isOwner ? 'owner' : guard.ctx.isAdmin ? 'admin' : 'user'

  const keys = listRegistered()
  const providerIds = Array.from(new Set(keys.map(k => k.slice(0, k.indexOf('.')))))
  // Infra providers verified live but not in the executor registry.
  const probeTargets = Array.from(new Set([...providerIds, 'stripe', 'supabase', 'vercel']))

  // Per-action simulation (governance dry-run, no provider calls).
  const reports: ActionReport[] = []
  for (const key of keys) {
    const dot = key.indexOf('.')
    const r = await operator.run({
      providerId: key.slice(0, dot), actionId: key.slice(dot + 1), input: {},
      user: { id: guard.ctx.userId || 'unknown', role },
      executionMode: 'simulation', approvalGranted: false,
    })
    reports.push({ action: key, ok: r.ok, stage: r.stage, status: r.normalized.status, detail: r.failure?.errorMessage })
  }

  // Live provider probes.
  const probes = await probeAll(probeTargets)
  const unhealthy = Object.values(probes).filter(p => !p.providerHealth).map(p => `${p.provider}: ${p.detail || 'unreachable'}`)

  const summary = {
    total_actions: reports.length,
    simulated_clean: reports.filter(r => r.status === 'simulated').length,
    needs_input: reports.filter(r => r.stage === 'payload_validation').length,
    blocked_by_policy: reports.filter(r => r.stage === 'safety_gate').length,
    providers_probed: probeTargets.length,
    providers_healthy: probeTargets.length - unhealthy.length,
  }

  const allLive = installation.ok && operator.ready() && unhealthy.length === 0

  return NextResponse.json({
    ok: allLive,
    confirmation: allLive ? 'Project connected to live data. Ready to ship.' : 'Checks incomplete — resolve items below before shipping.',
    installation,
    operatorReady: operator.ready(),
    summary,
    probes,
    unhealthy,
    actions: reports,
    checked_at: new Date().toISOString(),
  })
}
