// saas/app/api/hub/github-debug/route.ts
// One-shot GitHub diagnostic for the Hub Console (no auth gate — read-only, safe).
// Open https://saas.signalboostapp.com/api/hub/github-debug in a browser and read the JSON.
//
// It answers, in one call, why the live-data dropdowns (remote_select) might be empty:
//   - is GITHUB_WRITE_TOKEN present?
//   - does GET /user/repos actually return repositories with that token?
//   - what does the exact list_repos action shape look like (what the picker reads)?
//
// Delete this route once the dropdowns are confirmed working.

import { NextResponse } from 'next/server'

export async function GET() {
  const token = process.env.GITHUB_WRITE_TOKEN
  const out: Record<string, unknown> = {
    GITHUB_WRITE_TOKEN: token ? `present (${token.slice(0, 4)}…${token.slice(-4)}, len ${token.length})` : '(MISSING)',
    GITHUB_DEFAULT_OWNER: process.env.GITHUB_DEFAULT_OWNER || '(unset → defaults to SignalBoost)',
    GITHUB_DEFAULT_REPO: process.env.GITHUB_DEFAULT_REPO || '(unset → defaults to signalboost-live)',
  }

  if (!token) {
    out.verdict = 'GITHUB_WRITE_TOKEN is not set in Vercel. Add it (Project → Settings → Environment Variables) and redeploy — that is why the dropdowns are empty.'
    return NextResponse.json(out, { status: 200 })
  }

  try {
    const res = await fetch('https://api.github.com/user/repos?per_page=5&sort=updated', {
      headers: {
        Authorization: 'Bearer ' + token,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      cache: 'no-store',
    })
    out.githubStatus = res.status
    out.rateLimitRemaining = res.headers.get('x-ratelimit-remaining')
    out.tokenScopes = res.headers.get('x-oauth-scopes') || '(fine-grained or none reported)'

    const text = await res.text()
    let body: any = null
    try { body = JSON.parse(text) } catch { body = text.slice(0, 300) }

    if (!res.ok) {
      out.error = body?.message || body
      out.verdict = res.status === 401
        ? 'Token is invalid or expired — regenerate GITHUB_WRITE_TOKEN.'
        : res.status === 403
          ? 'Token lacks repo read permission (or rate-limited). Give it repo/contents read scope.'
          : 'GitHub rejected the request — see error above.'
      return NextResponse.json(out, { status: 200 })
    }

    const repos = Array.isArray(body) ? body : []
    out.repoCount = repos.length
    out.sampleRepos = repos.slice(0, 5).map((r: any) => r.full_name)
    out.listReposActionShape = { ok: true, data: { count: repos.length, repos: repos.slice(0, 3).map((r: any) => ({ name: r.full_name })) } }
    out.verdict = repos.length > 0
      ? 'Token works and returns repos. The picker should populate. If it still does not, the deployed build is stale — redeploy.'
      : 'Token works but sees 0 repositories. Use a token whose account/owner can see the repo, or set GITHUB_DEFAULT_OWNER.'

    return NextResponse.json(out, { status: 200 })
  } catch (err) {
    out.error = err instanceof Error ? err.message : 'fetch failed'
    out.verdict = 'Could not reach the GitHub API from the server.'
    return NextResponse.json(out, { status: 200 })
  }
}
