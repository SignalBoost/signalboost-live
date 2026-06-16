// saas/app/api/hub/deployments/route.ts
// Hub Console — Vercel deployments.
//   GET  -> list recent deployments  (read-only metadata; gated: deployments:read)
//   POST -> { action: 'rollback' | 'cancel', deploymentId }  (gated: deployments:deploy)
//
// GET is gated at read level (deployments:read), like the mutating POST.
//   The list returns only deployment metadata (url, state, commit, timestamps) —
//   no secrets. The gate was previously removed because the Supabase auth layer
//   returned null whenever SUPABASE_SERVICE_ROLE_KEY was absent at runtime,
//   401'ing the panel; that env fragility is resolved (env is read lazily), so the
//   gate is safe to enforce. Unauthenticated callers no longer see deployment data.
//
// Project id + creds resolve via the shared resolver (handles the empty
// VERCEL_HUB_PROJECT case). Flat { ok, error? } result style — repo rule.

import { NextRequest, NextResponse } from 'next/server'
import {
  getVercelDeployments,
  rollbackDeployment,
  cancelDeployment,
} from '@/lib/hub/deployments-service'
import { requirePermission } from '@/lib/auth/permission-middleware'
import { resolveVercelProject } from '@/lib/hub/vercel-project'

// ---- GET: list deployments (read-only — gated: deployments:read) ----
export async function GET(req: NextRequest) {
  const perm = await requirePermission(req, 'deployments:read')
  if (!perm.ok) {
    return NextResponse.json({ ok: false, error: (perm as any).error }, { status: (perm as any).status })
  }
  const creds = await resolveVercelProject()
  if (!creds.ok || !creds.token || !creds.projectId) {
    return NextResponse.json({ ok: false, error: creds.error || 'Vercel not configured' }, { status: 500 })
  }

  const limit = parseInt(req.nextUrl.searchParams.get('limit') || '20')
  const result = await getVercelDeployments(creds.teamId || '', creds.projectId, creds.token, limit)
  return NextResponse.json(result, { status: result.ok ? 200 : 502 })
}

// ---- POST: rollback or cancel (gated) ----
export async function POST(req: NextRequest) {
  const perm = await requirePermission(req, 'deployments:deploy')
  if (!perm.ok) {
    return NextResponse.json(
      { ok: false, error: (perm as any).error },
      { status: (perm as any).status }
    )
  }

  const creds = await resolveVercelProject()
  if (!creds.ok || !creds.token || !creds.projectId) {
    return NextResponse.json({ ok: false, error: creds.error || 'Vercel not configured' }, { status: 500 })
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
    const result = await rollbackDeployment(creds.projectId, deploymentId, creds.teamId || '', creds.token)
    return NextResponse.json(
      result.ok
        ? { ok: true, message: 'Deployment promoted to production (rollback complete)' }
        : result,
      { status: result.ok ? 200 : 502 }
    )
  }

  if (action === 'cancel') {
    const result = await cancelDeployment(deploymentId, creds.teamId || '', creds.token)
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
