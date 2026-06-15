// saas/app/api/hub/deployments/route.ts
// Hub Console — Vercel deployments.
//   GET  -> list recent deployments              (deployments:read)
//   POST -> { action: 'rollback' | 'cancel', deploymentId }  (deployments:deploy)
//
// Credentials: VERCEL_TOKEN + VERCEL_HUB_PROJECT (required), VERCEL_TEAM_ID (optional).
// Flat { ok, error? } result style — repo rule, tsconfig strict:false.

import { NextRequest, NextResponse } from 'next/server'
import {
  getVercelDeployments,
  rollbackDeployment,
  cancelDeployment,
} from '@/lib/hub/deployments-service'
import { requirePermission } from '@/lib/auth/permission-middleware'

function creds() {
  const token = process.env.VERCEL_TOKEN
  const projectId = process.env.VERCEL_HUB_PROJECT
  const teamId = process.env.VERCEL_TEAM_ID || ''
  return { token, projectId, teamId }
}

// ---- GET: list deployments ----
export async function GET(req: NextRequest) {
  const perm = await requirePermission(req, 'deployments:read')
  if (!perm.ok) {
    return NextResponse.json(
      { ok: false, error: (perm as any).error },
      { status: (perm as any).status }
    )
  }

  const { token, projectId, teamId } = creds()
  if (!token || !projectId) {
    return NextResponse.json(
      { ok: false, error: 'Vercel not configured — set VERCEL_TOKEN and VERCEL_HUB_PROJECT' },
      { status: 500 }
    )
  }

  const limit = parseInt(req.nextUrl.searchParams.get('limit') || '20')
  const result = await getVercelDeployments(teamId, projectId, token, limit)
  return NextResponse.json(result, { status: result.ok ? 200 : 502 })
}

// ---- POST: rollback or cancel ----
export async function POST(req: NextRequest) {
  const perm = await requirePermission(req, 'deployments:deploy')
  if (!perm.ok) {
    return NextResponse.json(
      { ok: false, error: (perm as any).error },
      { status: (perm as any).status }
    )
  }

  const { token, projectId, teamId } = creds()
  if (!token || !projectId) {
    return NextResponse.json(
      { ok: false, error: 'Vercel not configured — set VERCEL_TOKEN and VERCEL_HUB_PROJECT' },
      { status: 500 }
    )
  }

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 })
  }

  const action = String(body?.action || '')
  const deploymentId = String(body?.deploymentId || '')
  if (!deploymentId) {
    return NextResponse.json({ ok: false, error: 'deploymentId is required' }, { status: 400 })
  }

  if (action === 'rollback') {
    const result = await rollbackDeployment(projectId, deploymentId, teamId, token)
    return NextResponse.json(
      result.ok
        ? { ok: true, message: 'Deployment promoted to production (rollback complete)' }
        : result,
      { status: result.ok ? 200 : 502 }
    )
  }

  if (action === 'cancel') {
    const result = await cancelDeployment(deploymentId, teamId, token)
    return NextResponse.json(
      result.ok
        ? { ok: true, message: 'Build canceled', state: result.state }
        : result,
      { status: result.ok ? 200 : 502 }
    )
  }

  return NextResponse.json(
    { ok: false, error: `Unknown action: ${action || '(none)'} — expected 'rollback' or 'cancel'` },
    { status: 400 }
  )
}
