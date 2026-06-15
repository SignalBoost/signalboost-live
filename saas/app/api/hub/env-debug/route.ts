// saas/app/api/hub/env-debug/route.ts
// TEMPORARY DIAGNOSTIC — load https://saas.signalboostapp.com/api/hub/env-debug
// in your browser, copy the JSON, and send it back. Delete this file afterward.
//
// It reveals exactly why the Environment Variables panel is empty: whether the
// Vercel creds are present, what project id is being used, and what Vercel's
// /v9/projects/{id}/env endpoint actually returns — both WITH and WITHOUT the
// team id. No secret values are exposed (Vercel's env list returns only names,
// targets, and types). No auth gate, so nothing can silently block it.

import { NextResponse } from 'next/server'

const VERCEL_API = 'https://api.vercel.com'

function mask(v: string | undefined): string {
  if (!v) return '(MISSING)'
  if (v.length <= 8) return v[0] + '***' + v.slice(-1)
  return v.slice(0, 6) + '...' + v.slice(-4)
}

async function probe(projectId: string, token: string, teamId: string | undefined, withTeam: boolean) {
  const url =
    `${VERCEL_API}/v9/projects/${encodeURIComponent(projectId)}/env` +
    (withTeam && teamId ? `?teamId=${encodeURIComponent(teamId)}` : '')
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { Authorization: 'Bearer ' + token },
      cache: 'no-store',
    })
    const text = await res.text()
    let envCount: number | null = null
    let sampleKeys: string[] = []
    try {
      const data = JSON.parse(text)
      const envs = data.envs || (Array.isArray(data) ? data : [])
      envCount = Array.isArray(envs) ? envs.length : null
      sampleKeys = Array.isArray(envs) ? envs.slice(0, 8).map((e: any) => String(e?.key || '?')) : []
    } catch {
      // body was not JSON — leave the preview below
    }
    return {
      url: url.replace(projectId, mask(projectId)),
      status: res.status,
      ok: res.ok,
      envCount,
      sampleKeys,
      bodyPreview: envCount === null ? text.slice(0, 500) : undefined,
    }
  } catch (err) {
    return {
      url: url.replace(projectId, mask(projectId)),
      status: 0,
      ok: false,
      error: err instanceof Error ? err.message : 'fetch threw',
    }
  }
}

export async function GET() {
  const token = process.env.VERCEL_TOKEN
  const projectId = process.env.VERCEL_HUB_PROJECT
  const teamId = process.env.VERCEL_TEAM_ID || undefined

  const summary: Record<string, unknown> = {
    note: 'TEMP diagnostic — delete saas/app/api/hub/env-debug/route.ts after we fix this.',
    env: {
      VERCEL_TOKEN: token ? `present (${mask(token)})` : '(MISSING)',
      VERCEL_HUB_PROJECT: projectId ? `present (${mask(projectId)})` : '(MISSING)',
      VERCEL_HUB_PROJECT_looksLikeId: projectId ? projectId.startsWith('prj_') : false,
      VERCEL_TEAM_ID: teamId ? `present (${mask(teamId)})` : '(not set)',
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ? 'present' : '(MISSING)',
    },
  }

  if (!token || !projectId) {
    summary.verdict = 'Vercel creds missing — set VERCEL_TOKEN and VERCEL_HUB_PROJECT in Vercel project env, then redeploy.'
    return NextResponse.json(summary, { status: 200 })
  }

  const withTeam = await probe(projectId, token, teamId, true)
  const withoutTeam = teamId ? await probe(projectId, token, teamId, false) : null

  summary.probes = { withTeam, withoutTeam }

  // Plain-language verdict so we both see the cause immediately.
  const okProbe = (withTeam.ok && (withTeam.envCount || 0) > 0)
    ? withTeam
    : (withoutTeam && withoutTeam.ok && (withoutTeam.envCount || 0) > 0)
      ? withoutTeam
      : null

  if (okProbe) {
    summary.verdict = `WORKS — Vercel returned ${okProbe.envCount} variables${teamId && okProbe === withoutTeam ? ' WITHOUT teamId (your project is personal — VERCEL_TEAM_ID should be removed)' : ''}. If the panel is still empty, the problem is front-end rendering, not the API.`
  } else if (withTeam.status === 403 || (withoutTeam && withoutTeam.status === 403)) {
    summary.verdict = 'Vercel returned 403 — the VERCEL_TOKEN does not have access to this project/team. Regenerate the token with the right scope, or fix VERCEL_TEAM_ID.'
  } else if (withTeam.status === 404 || (withoutTeam && withoutTeam.status === 404)) {
    summary.verdict = 'Vercel returned 404 — VERCEL_HUB_PROJECT is wrong. Use the exact project id (prj_...) from Vercel > Project > Settings > General.'
  } else {
    summary.verdict = 'Vercel did not return variables — see probes[].status and bodyPreview above for the exact reason.'
  }

  return NextResponse.json(summary, { status: 200 })
}
