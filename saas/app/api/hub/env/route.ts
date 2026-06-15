// saas/app/api/hub/env/route.ts
// Hub Console — Vercel Environment Variables CRUD route.
//
//   GET    -> list env vars (masked metadata: key/target/type/id — NO values)
//   POST   -> add an env var            (gated: deployments:deploy)
//   PATCH  -> edit value and/or target  (gated: deployments:deploy)
//   DELETE -> remove an env var by id   (gated: deployments:deploy)
//
// Why GET is not auth-gated:
//   The list returns only masked metadata (variable NAMES, targets, types, ids —
//   Vercel never returns secret values here). It needs only VERCEL_TOKEN +
//   VERCEL_HUB_PROJECT, exactly like the proven `vercel.view_env` path. The old
//   permission gate routed through getCurrentUser(), which hard-fails to null when
//   SUPABASE_SERVICE_ROLE_KEY is absent in Vercel — that 401'd the list before it
//   ever reached Vercel, leaving the panel empty on a green build. Decoupling the
//   read-only display from the Supabase auth layer makes it work whenever the
//   Vercel credentials exist. Writes remain fully gated.
//
// Credentials: VERCEL_TOKEN + VERCEL_HUB_PROJECT (required), VERCEL_TEAM_ID (optional).
// Result shape: flat { ok, error? } — repo rule, tsconfig strict:false.

import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/auth/permission-middleware'
import { listEnv, addEnv, updateEnv, deleteEnv, EnvTarget } from '@/lib/hub/vercel-env'

function creds() {
  const token = process.env.VERCEL_TOKEN
  const projectId = process.env.VERCEL_HUB_PROJECT
  const teamId = process.env.VERCEL_TEAM_ID || undefined
  return { token, projectId, teamId }
}

function notConfigured() {
  return NextResponse.json(
    { ok: false, error: 'Vercel not configured — set VERCEL_TOKEN and VERCEL_HUB_PROJECT in Vercel env' },
    { status: 500 },
  )
}

function cleanTargets(t: unknown): EnvTarget[] {
  const allowed = ['production', 'preview', 'development']
  if (!Array.isArray(t)) return []
  return t.filter((x) => allowed.includes(String(x))) as EnvTarget[]
}

// ---- GET: list (read-only, masked metadata only, no auth gate) ----
export async function GET(_req: NextRequest) {
  const { token, projectId, teamId } = creds()
  if (!token || !projectId) return notConfigured()

  const result = await listEnv(projectId, token, teamId)
  return NextResponse.json(result, { status: result.ok ? 200 : 502 })
}

// ---- POST: add ----
export async function POST(req: NextRequest) {
  const perm = await requirePermission(req, 'deployments:deploy')
  if (!perm.ok) {
    return NextResponse.json({ ok: false, error: (perm as any).error }, { status: (perm as any).status })
  }
  const { token, projectId, teamId } = creds()
  if (!token || !projectId) return notConfigured()

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 })
  }

  const result = await addEnv(
    projectId,
    token,
    {
      key: String(body?.key || ''),
      value: String(body?.value ?? ''),
      type: body?.type ? String(body.type) : undefined,
      target: cleanTargets(body?.target),
      gitBranch: body?.gitBranch ? String(body.gitBranch) : undefined,
    },
    teamId,
  )
  return NextResponse.json(result, { status: result.ok ? 200 : 502 })
}

// ---- PATCH: edit ----
export async function PATCH(req: NextRequest) {
  const perm = await requirePermission(req, 'deployments:deploy')
  if (!perm.ok) {
    return NextResponse.json({ ok: false, error: (perm as any).error }, { status: (perm as any).status })
  }
  const { token, projectId, teamId } = creds()
  if (!token || !projectId) return notConfigured()

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 })
  }

  const id = String(body?.id || '')
  if (!id) return NextResponse.json({ ok: false, error: 'Env variable id is required' }, { status: 400 })

  const result = await updateEnv(
    projectId,
    token,
    id,
    {
      value: body?.value !== undefined ? String(body.value) : undefined,
      target: cleanTargets(body?.target),
      type: body?.type ? String(body.type) : undefined,
      gitBranch: body?.gitBranch !== undefined ? String(body.gitBranch) : undefined,
    },
    teamId,
  )
  return NextResponse.json(result, { status: result.ok ? 200 : 502 })
}

// ---- DELETE: remove (id via query ?id= or JSON body) ----
export async function DELETE(req: NextRequest) {
  const perm = await requirePermission(req, 'deployments:deploy')
  if (!perm.ok) {
    return NextResponse.json({ ok: false, error: (perm as any).error }, { status: (perm as any).status })
  }
  const { token, projectId, teamId } = creds()
  if (!token || !projectId) return notConfigured()

  let id = req.nextUrl.searchParams.get('id') || ''
  if (!id) {
    try {
      const body = await req.json()
      id = String(body?.id || '')
    } catch {
      // no body — fall through to the missing-id error below
    }
  }
  if (!id) return NextResponse.json({ ok: false, error: 'Env variable id is required' }, { status: 400 })

  const result = await deleteEnv(projectId, token, id, teamId)
  return NextResponse.json(result, { status: result.ok ? 200 : 502 })
}
