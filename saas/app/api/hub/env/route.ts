// saas/app/api/hub/env/route.ts
// Hub Console — Vercel Environment Variables CRUD route.
//
//   GET    -> list env vars (masked metadata)   (gated: deployments:read)
//   POST   -> add an env var            (gated: deployments:deploy)
//   PATCH  -> edit value and/or target  (gated: deployments:deploy)
//   DELETE -> remove an env var by id   (gated: deployments:deploy)
//
// GET is gated at read level (deployments:read), like the mutating handlers.
//   It returns only masked metadata (variable NAMES, targets, types, ids — Vercel
//   never returns secret values here). The read gate was previously removed
//   because the Supabase auth layer 401'd the panel whenever SUPABASE_SERVICE_ROLE_KEY
//   was absent at runtime; that env fragility is resolved (env is read lazily), so
//   the gate is safe to enforce. Unauthenticated callers no longer see env metadata.
//
// Project-id self-resolution (this is the fix for the empty list):
//   The old code read ONLY process.env.VERCEL_HUB_PROJECT. If that single var was
//   unset, the list was empty even though the token worked. Now the project id is
//   resolved in priority order:
//     1. VERCEL_HUB_PROJECT          (explicit override — wins if set)
//     2. VERCEL_PROJECT_ID           (Vercel's own system env var for THIS project;
//                                      present at runtime when "Automatically expose
//                                      System Environment Variables" is on — default)
//     3. Auto-discovery via the token: GET /v9/projects. If exactly ONE project is
//        visible to the token, use it. If several, the error lists every project's
//        name + id so the correct prj_… can be copied into VERCEL_HUB_PROJECT.
//   The resolved id is cached in-process so discovery runs at most once per cold start.
//
// Credentials: VERCEL_TOKEN (required). Project id resolved as above.
//              VERCEL_TEAM_ID / VERCEL_TEAM (optional).
// Result shape: flat { ok, error? } — repo rule, tsconfig strict:false.

import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/auth/permission-middleware'
import { listEnv, addEnv, updateEnv, deleteEnv, EnvTarget } from '@/lib/hub/vercel-env'

const VERCEL_API = 'https://api.vercel.com'

// In-process cache so token-based discovery runs at most once per cold start.
let cachedProjectId: string | null = null

function token(): string | undefined {
  return process.env.VERCEL_TOKEN
}

function teamId(): string | undefined {
  return process.env.VERCEL_TEAM_ID || process.env.VERCEL_TEAM || undefined
}

function explicitProjectId(): string | undefined {
  // Priority 1 + 2: explicit override, then Vercel's own system var for this project.
  return process.env.VERCEL_HUB_PROJECT || process.env.VERCEL_PROJECT_ID || undefined
}

function qs(team?: string): string {
  return team ? `?teamId=${encodeURIComponent(team)}` : ''
}

// Priority 3: discover the project id from the token itself.
// Returns { ok:true, id } when unambiguous, otherwise an error that lists the
// candidate projects so the right prj_… can be pinned via VERCEL_HUB_PROJECT.
async function discoverProjectId(
  tok: string,
  team?: string,
): Promise<{ ok: boolean; id?: string; error?: string }> {
  async function call(withTeam: boolean) {
    const url = `${VERCEL_API}/v9/projects${withTeam ? qs(team) : ''}`
    return fetch(url, { method: 'GET', headers: { Authorization: 'Bearer ' + tok }, cache: 'no-store' })
  }

  try {
    let res = await call(Boolean(team))
    if (!res.ok && team) res = await call(false)
    if (!res.ok) {
      const e = await res.text()
      return { ok: false, error: `Could not list Vercel projects (HTTP ${res.status}): ${e.slice(0, 300)}` }
    }
    const data = await res.json()
    const projects: any[] = Array.isArray(data?.projects) ? data.projects : (Array.isArray(data) ? data : [])
    if (projects.length === 0) {
      return { ok: false, error: 'No Vercel projects are visible to this token.' }
    }
    if (projects.length === 1) {
      return { ok: true, id: String(projects[0]?.id || '') }
    }
    const list = projects
      .slice(0, 20)
      .map((p) => `  ${String(p?.name || '?')} = ${String(p?.id || '?')}`)
      .join('\n')
    return {
      ok: false,
      error:
        `This token can see ${projects.length} projects, so I can't auto-pick one. ` +
        `Set VERCEL_HUB_PROJECT in Vercel to the correct prj_… below, then redeploy:\n${list}`,
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Project discovery failed' }
  }
}

// Resolve the project id every handler needs. Caches the discovered id.
async function resolveProjectId(
  tok: string,
  team?: string,
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const explicit = explicitProjectId()
  if (explicit) return { ok: true, id: explicit }
  if (cachedProjectId) return { ok: true, id: cachedProjectId }

  const found = await discoverProjectId(tok, team)
  if (found.ok && found.id) {
    cachedProjectId = found.id
    return { ok: true, id: found.id }
  }
  return found
}

function noToken() {
  return NextResponse.json(
    { ok: false, error: 'Vercel not configured — set VERCEL_TOKEN in Vercel env, then redeploy' },
    { status: 500 },
  )
}

function cleanTargets(t: unknown): EnvTarget[] {
  const allowed = ['production', 'preview', 'development']
  if (!Array.isArray(t)) return []
  return t.filter((x) => allowed.includes(String(x))) as EnvTarget[]
}

// ---- GET: list (read-only, masked metadata only — gated: deployments:read) ----
export async function GET(req: NextRequest) {
  const perm = await requirePermission(req, 'deployments:read')
  if (!perm.ok) {
    return NextResponse.json({ ok: false, error: (perm as any).error }, { status: (perm as any).status })
  }
  const tok = token()
  if (!tok) return noToken()
  const team = teamId()

  const resolved = await resolveProjectId(tok, team)
  if (!resolved.ok || !resolved.id) {
    return NextResponse.json({ ok: false, error: resolved.error || 'Could not resolve Vercel project id' }, { status: 500 })
  }

  const result = await listEnv(resolved.id, tok, team)
  return NextResponse.json(result, { status: result.ok ? 200 : 502 })
}

// ---- POST: add ----
export async function POST(req: NextRequest) {
  const perm = await requirePermission(req, 'deployments:deploy')
  if (!perm.ok) {
    return NextResponse.json({ ok: false, error: (perm as any).error }, { status: (perm as any).status })
  }
  const tok = token()
  if (!tok) return noToken()
  const team = teamId()

  const resolved = await resolveProjectId(tok, team)
  if (!resolved.ok || !resolved.id) {
    return NextResponse.json({ ok: false, error: resolved.error || 'Could not resolve Vercel project id' }, { status: 500 })
  }

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 })
  }

  const result = await addEnv(
    resolved.id,
    tok,
    {
      key: String(body?.key || ''),
      value: String(body?.value ?? ''),
      type: body?.type ? String(body.type) : undefined,
      target: cleanTargets(body?.target),
      gitBranch: body?.gitBranch ? String(body.gitBranch) : undefined,
    },
    team,
  )
  return NextResponse.json(result, { status: result.ok ? 200 : 502 })
}

// ---- PATCH: edit ----
export async function PATCH(req: NextRequest) {
  const perm = await requirePermission(req, 'deployments:deploy')
  if (!perm.ok) {
    return NextResponse.json({ ok: false, error: (perm as any).error }, { status: (perm as any).status })
  }
  const tok = token()
  if (!tok) return noToken()
  const team = teamId()

  const resolved = await resolveProjectId(tok, team)
  if (!resolved.ok || !resolved.id) {
    return NextResponse.json({ ok: false, error: resolved.error || 'Could not resolve Vercel project id' }, { status: 500 })
  }

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 })
  }

  const id = String(body?.id || '')
  if (!id) return NextResponse.json({ ok: false, error: 'Env variable id is required' }, { status: 400 })

  const result = await updateEnv(
    resolved.id,
    tok,
    id,
    {
      value: body?.value !== undefined ? String(body.value) : undefined,
      target: cleanTargets(body?.target),
      type: body?.type ? String(body.type) : undefined,
      gitBranch: body?.gitBranch !== undefined ? String(body.gitBranch) : undefined,
    },
    team,
  )
  return NextResponse.json(result, { status: result.ok ? 200 : 502 })
}

// ---- DELETE: remove (id via query ?id= or JSON body) ----
export async function DELETE(req: NextRequest) {
  const perm = await requirePermission(req, 'deployments:deploy')
  if (!perm.ok) {
    return NextResponse.json({ ok: false, error: (perm as any).error }, { status: (perm as any).status })
  }
  const tok = token()
  if (!tok) return noToken()
  const team = teamId()

  const resolved = await resolveProjectId(tok, team)
  if (!resolved.ok || !resolved.id) {
    return NextResponse.json({ ok: false, error: resolved.error || 'Could not resolve Vercel project id' }, { status: 500 })
  }

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

  const result = await deleteEnv(resolved.id, tok, id, team)
  return NextResponse.json(result, { status: result.ok ? 200 : 502 })
}
